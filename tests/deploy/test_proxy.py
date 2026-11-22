"""Run the image's server block against an isolated loopback upstream."""
import base64
import hashlib
import http.client
import json
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


TEACHER_REQUEST_PATH = "/api/v1/catalog/objects/fixture-teacher/teacher-homepage/requests"
LEGAL_API_VERSION = "/api/v1/legal/documents/terms/versions/3.0"


class Backend(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == LEGAL_API_VERSION:
            content_type, body = "application/json", b'{"html":"<p>Terms fixture</p>"}'
        elif self.path == LEGAL_API_VERSION + "/html":
            content_type, body = "text/html", b"<p>Terms fixture</p>"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        self.record_upload()

    def record_upload(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.server.uploads.append((self.path, hashlib.sha256(body).digest()))
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path == TEACHER_REQUEST_PATH:
            self.record_upload()
            return
        time.sleep(36)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"finished")

    def log_message(self, *_):
        pass


class TransferProxyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
        cls.addClassCleanup(backend.server_close)
        threading.Thread(target=backend.serve_forever, daemon=True).start()
        cls.addClassCleanup(backend.shutdown)
        cls.uploads = backend.uploads = []
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            cls.port = probe.getsockname()[1]
        temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(temp.cleanup)
        root = Path(temp.name)
        document_root = root / "html"
        document_root.mkdir()
        assets = document_root / "assets"
        assets.mkdir()
        (assets / "main.hash.js").write_text("export {}")
        (document_root / "terms.html").write_bytes(b"Terms fixture")
        (document_root / "index.html").write_bytes(b"Home fixture")
        site = Path("deploy/nginx.conf").read_text().replace(
            "listen 8080;", f"listen 127.0.0.1:{cls.port};"
        ).replace("http://backend:8080", f"http://127.0.0.1:{backend.server_port}").replace(
            "/usr/share/nginx/html", str(document_root)
        )
        (root / "nginx.conf").write_text(
            "daemon off; pid nginx.pid; error_log stderr; events {}"
            "http { access_log off; client_body_temp_path body; proxy_temp_path proxy; "
            "fastcgi_temp_path fastcgi; uwsgi_temp_path uwsgi; scgi_temp_path scgi; " + site + "}"
        )
        proc = subprocess.Popen([shutil.which("nginx") or "/usr/sbin/nginx", "-p", temp.name,
                                 "-e", "stderr", "-c", "nginx.conf"])
        cls.addClassCleanup(proc.wait, 5)
        cls.addClassCleanup(proc.terminate)
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError("nginx failed to start")
            try:
                with socket.create_connection(("127.0.0.1", cls.port), timeout=1):
                    return
            except OSError:
                time.sleep(0.05)
        raise TimeoutError("nginx did not listen")

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=45)
        try:
            conn.request(method, path, body, headers or {})
            response = conn.getresponse()
            return response.status, response.read(), response.headers
        finally:
            conn.close()

    def test_only_available_assets_receive_immutable_cache_headers(self):
        for name, expected_status in [("main.hash.js", 200), ("missing.hash.js", 404)]:
            with self.subTest(name=name):
                status, _, headers = self.request("GET", "/assets/" + name)
                self.assertEqual(status, expected_status)
                cache = headers.get("Cache-Control", "")
                if expected_status == 200:
                    self.assertIn("immutable", cache)
                else:
                    self.assertNotIn("immutable", cache)
                    self.assertNotIn("max-age=31536000", cache)

    def test_media_body_reaches_upstream(self):
        path = "/api/v1/media/uploads/sample/content"
        body = b"x" * (2 << 20)
        self.assertEqual(self.request("PUT", path, body)[0], 204)
        self.assertIn((path, hashlib.sha256(body).digest()), self.uploads)

    def test_ordinary_and_capture_requests_keep_the_one_mib_limit(self):
        for path in ["/api/v1/media/uploads", "/api/v1/verification/capture"]:
            self.assertEqual(self.request("PUT", path, b"x" * ((1 << 20) + 1))[0], 413)
            self.assertFalse(any(url == path for url, _ in self.uploads))

    def test_teacher_homepage_photo_request_reaches_upstream_with_a_bounded_body(self):
        image = base64.b64encode(b"x" * (2 << 20)).decode("ascii")
        body = json.dumps({
            "kind": "supplement",
            "field": {"field": "photo"},
            "message": "Photo fixture",
            "value": {"photo": {"content_type": "image/png", "data": image}},
        }).encode()
        self.assertEqual(self.request("POST", TEACHER_REQUEST_PATH, body,
                                      {"Content-Type": "application/json"})[0], 204)
        received = [(path, digest) for path, digest in self.uploads if path == TEACHER_REQUEST_PATH]
        self.assertEqual(received, [(TEACHER_REQUEST_PATH, hashlib.sha256(body).digest())])

        for path, limit in [(TEACHER_REQUEST_PATH, 4 << 20),
                            (TEACHER_REQUEST_PATH + "/extra", 1 << 20)]:
            with self.subTest(path=path):
                self.assertEqual(self.request("POST", path, headers={"Content-Length": str(limit + 1)})[0], 413)

    def test_slow_custody_response_reaches_client(self):
        self.assertEqual(self.request("POST", "/api/v1/storage/custody", b"{}")[:2],
                         (200, b"finished"))

    def test_legal_pages_support_direct_navigation(self):
        for path in ("/legal/terms", "/legal/terms/versions", "/legal/terms/versions/3.0"):
            with self.subTest(path=path):
                status, body, headers = self.request("GET", path)
                self.assertEqual((status, body), (200, b"Home fixture"))
                self.assertEqual(headers.get_content_type(), "text/html")
                self.assertEqual(headers.get("Cache-Control"), "no-cache")

    def test_legal_document_api_reaches_backend(self):
        for path, content_type, body in (
            (LEGAL_API_VERSION, "application/json", b'{"html":"<p>Terms fixture</p>"}'),
            (LEGAL_API_VERSION + "/html", "text/html", b"<p>Terms fixture</p>"),
        ):
            with self.subTest(path=path):
                status, response, headers = self.request("GET", path)
                self.assertEqual((status, response), (200, body))
                self.assertEqual(headers.get_content_type(), content_type)

    def test_only_terms_get_allows_the_sso_origin(self):
        sso = "https://sso.stuhelper.com"
        header = "Access-Control-Allow-Origin"
        for origin in (sso, "https://example.org"):
            status, body, headers = self.request("GET", "/terms.html", headers={"Origin": origin})
            self.assertEqual((status, body), (200, b"Terms fixture"))
            self.assertEqual(headers.get_all(header), [sso])
            self.assertEqual(headers.get("Cache-Control"), "no-cache")
            self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        for method, path in (("HEAD", "/terms.html"), ("GET", "/")):
            status, _, headers = self.request(method, path, headers={"Origin": sso})
            self.assertEqual(status, 200)
            self.assertNotIn(header, headers)


if __name__ == "__main__":
    unittest.main()
