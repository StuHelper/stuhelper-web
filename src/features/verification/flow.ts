import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { verificationPages } from './api'
import { ApiError, errorCode } from '../../shared/api/errors'
import { useVerification, type Application, type Credential, type EmailChallenge, type EmailTransferStatus, type Kind, type Material, type Method, type RemovalRequest, type School, type Schemas, type Stage, type StudentProfile, type Summary } from './api'

type Section = 'schools' | 'applications' | 'credentials' | 'requests'
type ErrorTarget = Section | 'form' | 'profile' | 'removal' | 'email' | 'school'
/** Teacher applications share the application list but use the teacher form and review. */
type StudentApplication = Application & { kind: Kind }
const isStudentApplication = (application: Application): application is StudentApplication => application.kind !== 'teacher'
const pendingChallenge = ['processing', 'waiting_sms']

/**
 * State and actions of the student verification page. The server decides every
 * outcome; this keeps the forms, the active application and school polling.
 */
export function useVerificationFlow() {
  const api = useVerification()
  const lifetime = new AbortController()
  const loading = ref(false)
  const busy = ref(false)
  // The server holds every identity check for a fixed minimum time; the page shows that wait.
  const checking = ref(false)
  // After repeated failures the server refuses new checks for a while (HTTP 429 with a wait).
  const cooldownUntil = ref(0)
  const error = ref('')
  const loadError = ref('')
  const errorTarget = ref<ErrorTarget>('form')
  const profileCredentialId = ref('')
  // The credential whose profile was last asked for. It is kept when the request fails, so the
  // failure is shown under that one credential; profileCredentialId is set only on success.
  const profileRequestId = ref('')
  const notice = ref('')
  const summary = shallowRef<Summary>()
  const schools = ref<School[]>([])
  const applications = ref<Application[]>([])
  const credentials = ref<Credential[]>([])
  const requests = ref<RemovalRequest[]>([])
  const cursors = reactive<Record<Section, string>>({ schools: '', applications: '', credentials: '', requests: '' })
  const profile = shallowRef<StudentProfile>()
  const profileCredential = computed(() => credentials.value.find((item) => item.id === profileCredentialId.value))

  const mode = ref<'student' | 'identity'>('student')
  const selectedSchool = ref('')
  const selectedMethod = ref<Method>('manual_material_review')
  const stage = ref<Stage>('bachelor')
  const kind = ref<Kind>('student')
  const consent = ref(false)
  const active = shallowRef<Application>()
  const email = shallowRef<EmailChallenge>()
  const materials = ref<Material[]>([])
  const smsCode = ref('')
  const form = reactive({ student_id: '', name: '', document_number: '', password: '', department: '', email: '', material_type: '', code: '' })
  const removal = reactive({ id: '', kind: 'revoke' as 'revoke' | 'delete', reason: '' })
  const suggestion = reactive({ name: '', website: '' })

  const school = computed(() => schools.value.find((item) => item.id === selectedSchool.value))
  const availableMethods = computed(() => school.value?.methods ?? [])
  const manual = computed(() => selectedMethod.value === 'manual_material_review')
  const emailMethod = computed(() => selectedMethod.value === 'student_email_outbound_otp' || selectedMethod.value === 'student_email_inbound_challenge')
  const schoolPending = computed(() => !!active.value?.school_challenge && pendingChallenge.includes(active.value.school_challenge.state))
  // Schools with an imported profile record study facts from school evidence instead of user choice.
  const chooseStudy = computed(() => manual.value || !school.value?.profile_schema || school.value.profile_schema === 'buaa.imported.v1')
  const chooseStage = computed(() => chooseStudy.value && school.value?.method_capabilities?.[selectedMethod.value]?.study_stage_required !== false)
  const writable = computed(() => !!active.value && ['in_progress', 'supplement_required'].includes(active.value.state) && !schoolPending.value)
  // An email challenge that has been created waits outside the form: for the code (outbound) or for
  // the person's own mail to the one-time address (inbound).
  const emailWaiting = computed(() => !!email.value && writable.value && mode.value === 'student' && emailMethod.value)
  /**
   * The step of the student flow: 1 choose, 2 fill in, 3 wait for something outside the form.
   * A school login challenge holds step three only while it is processing or waiting for the SMS;
   * after it fails, is cancelled or expires, an application still open returns to the form for a retry.
   */
  const step = computed<1 | 2 | 3>(() => (!active.value ? 1 : emailWaiting.value || schoolPending.value || !writable.value ? 3 : 2))

  // The page asks who the person is before it lists the methods. A school asks when it takes study
  // facts from the person's own choice for at least one method. Temporary newcomers exist only in manual review.
  const asksKind = computed(() => !!school.value && (availableMethods.value.includes('manual_material_review') || !school.value.profile_schema || school.value.profile_schema === 'buaa.imported.v1'))
  const kindChoices = computed<Kind[]>(() => (asksKind.value ? ['student', 'alumni', ...(availableMethods.value.includes('manual_material_review') ? ['newcomer' as const] : [])] : []))
  /**
   * Whether the school offers a method to the chosen identity, from the school's own capability
   * list. This only greys out choices the server would refuse; the server checks again on submit.
   */
  function methodAllowed(method: Method) {
    if (!asksKind.value) return true
    if (kind.value === 'newcomer') return method === 'manual_material_review'
    const allowed = school.value?.method_capabilities?.[method]?.allowed_kinds
    return !allowed || allowed.includes(kind.value)
  }

  /** What the person's student verification amounts to right now, most decisive fact first. */
  const standing = computed(() => {
    if (!summary.value) return 'unknown' as const
    if (summary.value.campus_eligibility) return 'verified' as const
    const own = applications.value.filter(isStudentApplication)
    for (const [state, name] of [['pending_review', 'review'], ['supplement_required', 'supplement'], ['in_progress', 'draft']] as const) if (own.some((row) => row.state === state)) return name
    const latest = [...own].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    if (latest?.state === 'rejected') return 'rejected' as const
    if (credentials.value.some((row) => row.state === 'expired' || row.state === 'revoked')) return 'lapsed' as const
    return 'none' as const
  })
  /** The application the current standing is about: the open one, or the latest rejected one. */
  const standingApplication = computed(() => {
    const own = applications.value.filter(isStudentApplication)
    const state = { review: 'pending_review', supplement: 'supplement_required', draft: 'in_progress', rejected: 'rejected' }[standing.value as string]
    return state ? [...own].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).find((row) => row.state === state) : undefined
  })

  function fail(failure: unknown, target: ErrorTarget = 'form') {
    errorTarget.value = target
    error.value = errorCode(failure)
    if (failure instanceof ApiError && failure.status === 429 && failure.retryAfter) cooldownUntil.value = Date.now() + failure.retryAfter * 1000
  }
  /** Runs an identity check: shows the checking state and stays closed while a cooldown runs. */
  async function check(work: () => Promise<void>) {
    if (cooldownUntil.value > Date.now()) throw new ApiError('rate_limited', false, 429, undefined, Math.ceil((cooldownUntil.value - Date.now()) / 1000))
    checking.value = true
    try { await work() } finally { checking.value = false }
  }

  function merge<T extends { id: string }>(current: T[], rows: T[]) {
    return [...new Map([...current, ...rows].map((row) => [row.id, row])).values()]
  }

  async function reload() {
    loading.value = true
    loadError.value = ''
    profile.value = undefined
    profileCredentialId.value = ''
    profileRequestId.value = ''
    try {
      const signal = lifetime.signal
      const [s, a, c, r, state] = await Promise.all([
        api.list('School', '/api/v1/verification/schools', { limit: 100, signal }),
        verificationPages(after => api.list('Application', '/api/v1/verification/applications', { after, limit: 100, signal })),
        verificationPages(after => api.list('Credential', '/api/v1/verification/credentials', { after, limit: 100, signal })),
        api.list('RemovalRequest', '/api/v1/verification/requests', { signal }),
        api.get('Summary', '/api/v1/verification/summary', signal),
      ])
      schools.value = merge(schools.value, s.items)
      cursors.schools = s.next
      applications.value = a.items
      cursors.applications = a.next
      credentials.value = c.items
      cursors.credentials = c.next
      requests.value = r.items
      cursors.requests = r.next
      summary.value = state
      if (!selectedSchool.value && s.items[0]) {
        selectedSchool.value = s.items[0].id
        selectSchool()
      }
    } catch (failure) {
      if (!lifetime.signal.aborted) loadError.value = errorCode(failure)
      if (failure instanceof ApiError && failure.denied) clearPrivate()
    } finally {
      loading.value = false
    }
  }

  function clearPrivate() {
    clearTransfer()
    summary.value = undefined
    applications.value = []
    credentials.value = []
    requests.value = []
    profile.value = undefined
    profileCredentialId.value = ''
    profileRequestId.value = ''
    active.value = undefined
    materials.value = []
  }

  async function loadMore(section: Section) {
    await action(async () => {
      const after = cursors[section]
      if (!after) return
      if (section === 'schools') {
        const page = await api.list('School', '/api/v1/verification/schools', { limit: 100, after })
        schools.value = merge(schools.value, page.items)
        cursors.schools = page.next
      } else if (section === 'applications') {
        const page = await api.list('Application', '/api/v1/verification/applications', { after })
        applications.value = merge(applications.value, page.items)
        cursors.applications = page.next
      } else if (section === 'credentials') {
        const page = await api.list('Credential', '/api/v1/verification/credentials', { after })
        credentials.value = merge(credentials.value, page.items)
        cursors.credentials = page.next
      } else {
        const page = await api.list('RemovalRequest', '/api/v1/verification/requests', { after })
        requests.value = merge(requests.value, page.items)
        cursors.requests = page.next
      }
    }, section)
  }

  function reset() {
    clearTransfer()
    stopPolling()
    stopMailPolling()
    cancelDetached(active.value)
    smsCode.value = ''
    active.value = undefined
    email.value = undefined
    materials.value = []
    form.password = ''
    form.document_number = ''
    consent.value = false
    notice.value = ''
    error.value = ''
  }

  function selectSchool(chosen?: School) {
    if (chosen) {
      schools.value = merge(schools.value, [chosen])
      selectedSchool.value = chosen.id
    }
    reset()
    selectedMethod.value = availableMethods.value[0] ?? 'manual_material_review'
    form.material_type = school.value?.material_types[0] ?? ''
    kind.value = 'student'
  }

  function selectMethod() {
    reset()
    if (!manual.value) kind.value = 'student'
  }

  /** Choose the identity first; a method this identity may not use gives way to the first one it may. */
  function chooseKind(next: Kind) {
    if (active.value || kind.value === next) return
    kind.value = next
    if (!methodAllowed(selectedMethod.value)) {
      const fallback = availableMethods.value.find(methodAllowed)
      if (fallback) selectedMethod.value = fallback
    }
    reset()
  }

  /** Choose a method the current identity may use. Consent belongs to one method's notice, so it is asked again. */
  function chooseMethod(method: Method) {
    if (active.value || selectedMethod.value === method || !methodAllowed(method)) return
    selectedMethod.value = method
    reset()
  }

  const transfer = shallowRef<EmailTransferStatus>()
  const transferAsking = ref(false)
  const transferChanged = ref(false)
  const transferRetry = ref(false)
  // A successful send can be reused only for this application, recipient and publication.
  let grant: { applicationId: string; studentId: string; version: string; digest: string } | undefined

  function clearTransfer() {
    grant = undefined
    transfer.value = undefined
    transferAsking.value = false
    transferChanged.value = false
    transferRetry.value = false
  }

  watch(() => form.student_id.trim(), clearTransfer, { flush: 'sync' })

  async function askTransfer(changed = transferChanged.value) {
    clearTransfer()
    transferChanged.value = changed
    try {
      transfer.value = await api.get('EmailTransferConsentStatus', '/api/v1/verification/email-transfer-consent', lifetime.signal)
      transferAsking.value = true
    } catch (failure) {
      transferRetry.value = true
      throw failure
    }
  }

  // Leave the draft on the server for a later visit.
  function backToMethod() {
    const keep = { school: selectedSchool.value, method: selectedMethod.value, consent: consent.value }
    reset()
    selectedSchool.value = keep.school
    selectedMethod.value = keep.method
    consent.value = keep.consent
    form.code = ''
  }

  function selectMode(next: 'student' | 'identity') {
    mode.value = next
    reset()
  }

  async function action(work: () => Promise<void>, target: ErrorTarget = 'form') {
    if (busy.value) return
    busy.value = true
    errorTarget.value = target
    error.value = ''
    notice.value = ''
    try {
      await work()
    } catch (failure) {
      fail(failure, target)
    } finally {
      busy.value = false
      // Secrets never outlive a single submission.
      form.password = ''
    }
  }

  const start = () => action(async () => {
    if (!school.value || !consent.value) throw new ApiError('invalid_input')
    const body: Schemas['CreateApplication'] = { school_id: school.value.id, method: selectedMethod.value, stage: chooseStage.value ? stage.value : 'unknown', kind: chooseStudy.value ? kind.value : 'unknown', consent: true, notice_version: school.value.notice_version }
    active.value = await api.write('Application', '/api/v1/verification/applications', body)
    await reload()
  })

  const resume = (application: StudentApplication) => action(async () => {
    clearTransfer()
    mode.value = 'student'
    for (let page = 0; !schools.value.some((row) => row.id === application.school_id) && cursors.schools && page < 20; page++) {
      const more = await api.list('School', '/api/v1/verification/schools', { limit: 100, after: cursors.schools })
      schools.value = merge(schools.value, more.items)
      cursors.schools = more.next
    }
    if (!schools.value.some((row) => row.id === application.school_id)) throw new ApiError('method_unavailable')
    selectedSchool.value = application.school_id
    selectedMethod.value = application.method
    stage.value = application.stage
    kind.value = application.kind
    active.value = application
    consent.value = true
    materials.value = (await api.list('Material', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/materials`)).items
    form.material_type = school.value?.material_types[0] ?? ''
    if (application.method === 'manual_material_review') {
      try {
        const saved = await api.get('ManualInput', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/form`)
        Object.assign(form, { student_id: saved.student_id, name: saved.name, department: saved.department, email: saved.email, material_type: saved.material_type })
      } catch (failure) {
        if (errorCode(failure) !== 'not_found') throw failure
      }
    }
    email.value = undefined
    if (emailMethod.value) {
      // A restored challenge does not disclose the previous identity inputs.
      form.student_id = ''
      form.name = ''
      emailSentAt.value = 0
      try {
        email.value = await api.get('EmailChallenge', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/email`)
      } catch (failure) {
        if (errorCode(failure) !== 'not_found') throw failure
      }
    }
  })

  const submit = () => submitForm()
  const agreeTransfer = () => transferAsking.value && transfer.value
    ? submitForm(transfer.value.document)
    : Promise.resolve()

  const submitForm = (choice?: EmailTransferStatus['document']) => action(async () => {
    if (mode.value === 'identity') {
      if (!school.value || !consent.value) throw new ApiError('invalid_input')
      const body: Schemas['IdentityInput'] = { student_id: form.student_id, name: form.name, document_number: form.document_number, password: '', school_id: school.value.id, notice_version: school.value.notice_version, consent: true }
      await check(async () => { summary.value = await api.write('Summary', '/api/v1/verification/identity', body) })
      form.document_number = ''
      await reload()
      notice.value = 'identityDone'
      return
    }
    if (!active.value) throw new ApiError('invalid_input')
    const path = `/api/v1/verification/applications/${encodeURIComponent(active.value.id)}`
    if (manual.value) {
      const body: Schemas['ManualInput'] = { student_id: form.student_id, name: form.name, department: form.department, email: form.email, material_type: form.material_type, material_ids: materials.value.map((m) => m.id), revision: active.value.revision }
      active.value = await api.write('Application', `${path}/manual`, body)
      notice.value = 'submitted'
    } else if (emailMethod.value) {
      const body: Schemas['EmailInput'] = { student_id: form.student_id, name: form.name }
      const outbound = selectedMethod.value === 'student_email_outbound_otp'
      const applicationId = active.value.id
      const studentId = form.student_id.trim()
      const current = transfer.value?.document
      const canResend = grant && current && grant.applicationId === applicationId && grant.studentId === studentId
        && grant.version === current.version && grant.digest === current.digest
      if (outbound && !canResend) {
        if (!choice || choice !== current) {
          if (transferAsking.value) return
          await askTransfer()
          return
        }
        body.email_transfer_consent = { document_id: choice.document_id, version: choice.version, digest: choice.digest, accepted: true }
      }
      try {
        await check(async () => { email.value = await api.write('EmailChallenge', `${path}/email`, body) })
      } catch (failure) {
        const code = errorCode(failure)
        // The choice no longer counts (withdrawn or a new notice): show the current notice again.
        if (outbound && (code === 'email_transfer_consent_required' || code === 'email_transfer_consent_changed')) {
          await askTransfer(code === 'email_transfer_consent_changed')
        } else if (outbound && failure instanceof ApiError && failure.status === 503) {
          if (choice) clearTransfer()
          transferRetry.value = true
        }
        throw failure
      }
      transferRetry.value = false
      if (choice) grant = { applicationId, studentId, version: choice.version, digest: choice.digest }
      transferAsking.value = false
      transferChanged.value = false
      emailSentAt.value = Date.now()
    } else {
      const body: Schemas['VerifyInput'] = { student_id: form.student_id, name: selectedMethod.value === 'school_sso' ? '' : form.name, document_number: form.document_number, password: form.password }
      await check(async () => { active.value = await api.write('Application', `${path}/verify`, body) })
      form.document_number = ''
      notice.value = active.value.state === 'approved' ? 'verified' : 'schoolProgress'
    }
    await reload()
    if (active.value?.state === 'approved') {
      const outcome = notice.value
      backToMethod()
      notice.value = outcome
    }
  })

  const resendEmail = async () => {
    if (busy.value) return
    if (!form.student_id.trim() || !form.name.trim()) {
      // Keep the application and let the person re-enter the required facts.
      stopMailPolling()
      email.value = undefined
      form.code = ''
      error.value = ''
      return
    }
    await submit()
  }

  const confirmEmail = () => action(async () => {
    if (!active.value) return
    const id = active.value.id
    await check(async () => { active.value = await api.write('Application', `/api/v1/verification/applications/${encodeURIComponent(id)}/email/confirm`, { code: form.code }) })
    form.code = ''
    await reload()
    // A finished application leaves nothing to edit; start over with the outcome shown.
    const approved = active.value?.state === 'approved'
    if (approved) backToMethod()
    notice.value = approved ? 'verified' : 'schoolProgress'
  }, 'email')

  const refreshApplication = () => action(async () => {
    if (!active.value) return
    const id = encodeURIComponent(active.value.id)
    active.value = active.value.school_challenge ? await schoolOperation(active.value, 'poll') : await api.get('Application', `/api/v1/verification/applications/${id}`)
    materials.value = (await api.list('Material', `/api/v1/verification/applications/${id}/materials`)).items
    if (email.value) email.value = await api.get('EmailChallenge', `/api/v1/verification/applications/${id}/email`)
    await reload()
  })

  function captured(material: Material) {
    if (!materials.value.some((item) => item.id === material.id)) {
      materials.value = [...materials.value, material]
    }
  }

  const removeMaterial = (id: string) => action(async () => {
    await api.write('Material', `/api/v1/verification/materials/${encodeURIComponent(id)}`, undefined, 'DELETE')
    materials.value = materials.value.filter((m) => m.id !== id)
  })

  const requestRemoval = () => action(async () => {
    const body: Schemas['RemovalInput'] = { kind: removal.kind, reason: removal.reason }
    await api.write('RemovalRequest', `/api/v1/verification/credentials/${encodeURIComponent(removal.id)}/requests`, body)
    removal.id = ''
    removal.reason = ''
    notice.value = 'requested'
    await reload()
  }, 'removal')

  const suggest = () => action(async () => {
    const body: Schemas['SuggestionInput'] = { name: suggestion.name, website: suggestion.website }
    await api.write('Suggestion', '/api/v1/verification/suggestions', body)
    suggestion.name = ''
    suggestion.website = ''
    notice.value = 'suggested'
  })

  const showProfile = (id: string) => action(async () => {
    profile.value = undefined
    profileCredentialId.value = ''
    profileRequestId.value = id
    const result = await api.get('StudentProfile', `/api/v1/verification/credentials/${encodeURIComponent(id)}/profile`, lifetime.signal)
    profile.value = result
    profileCredentialId.value = id
  }, 'profile')

  function schoolName(id: string) {
    return schools.value.find((item) => item.id === id)?.name ?? ''
  }

  // School login: the provider may ask for an SMS code; poll until the bound
  // session finishes. Polling stops after 100 attempts or when the page closes.
  let timer: ReturnType<typeof setTimeout> | undefined
  let polls = 0
  let polledChallenge = ''

  function stopPolling() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  // Outbound mail: show the real sending state. The server queues the message and
  // records the provider receipt, so poll briefly until it leaves "queued".
  const emailSentAt = ref(0)
  let mailTimer: ReturnType<typeof setTimeout> | undefined
  let mailPolls = 0
  function stopMailPolling() {
    if (mailTimer) clearTimeout(mailTimer)
    mailTimer = undefined
  }
  async function pollMail() {
    mailTimer = undefined
    const current = email.value
    if (!current || current.state !== 'queued' || !active.value || lifetime.signal.aborted || mailPolls >= 30) return
    mailPolls++
    try {
      const updated = await api.get('EmailChallenge', `/api/v1/verification/applications/${encodeURIComponent(active.value.id)}/email`)
      if (email.value?.id === current.id) email.value = updated
    } catch {
      // A failed status read keeps the last known state; the next poll or a resend recovers.
    }
    if (email.value?.state === 'queued' && mailPolls < 30) mailTimer = setTimeout(() => void pollMail(), 2000)
  }
  watch(() => email.value?.id, () => {
    stopMailPolling()
    mailPolls = 0
    if (email.value?.state === 'queued') mailTimer = setTimeout(() => void pollMail(), 1500)
  })

  async function schoolOperation(application: Application, step: 'poll' | 'submit_sms' | 'cancel') {
    const current = application.school_challenge
    if (!current) throw new ApiError('conflict')
    const body: Schemas['SchoolChallengeInput'] = { action: step, challenge_id: current.id, revision: application.revision, code: step === 'submit_sms' ? smsCode.value : '' }
    return api.write('Application', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/school-challenge`, body, 'POST', lifetime.signal)
  }

  function cancelDetached(application?: Application) {
    const current = application?.school_challenge
    if (!application || !current || !pendingChallenge.includes(current.state)) return
    const body: Schemas['SchoolChallengeInput'] = { action: 'cancel', challenge_id: current.id, revision: application.revision, code: '' }
    void api.write('Application', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/school-challenge`, body).catch(() => {
      // Navigation may interrupt cleanup; the short-lived school session expires on its own.
      if (!lifetime.signal.aborted) fail(new ApiError('network'), 'school')
    })
  }

  const continueSchool = (step: 'submit_sms' | 'cancel') => action(async () => {
    if (!active.value) return
    active.value = await schoolOperation(active.value, step)
    smsCode.value = ''
    if (active.value.state === 'approved') {
      notice.value = 'verified'
      await reload()
    }
  }, 'school')

  async function poll() {
    timer = undefined
    if (!active.value || !schoolPending.value || lifetime.signal.aborted || polls >= 100) return
    if (busy.value) {
      schedule()
      return
    }
    const current = active.value
    polls++
    try {
      const updated = await schoolOperation(current, 'poll')
      if (active.value?.id !== current.id || active.value.school_challenge?.id !== current.school_challenge?.id) return
      if (busy.value || active.value.revision !== current.revision) {
        schedule()
        return
      }
      active.value = updated
      if (updated.state === 'approved') {
        notice.value = 'verified'
        await reload()
      } else schedule()
    } catch (failure) {
      if (!lifetime.signal.aborted) fail(failure, 'school')
    }
  }

  function schedule() {
    stopPolling()
    if (schoolPending.value && polls < 100) timer = setTimeout(() => void poll(), 3000)
  }

  watch(() => active.value?.school_challenge, (current) => {
    if (current?.id !== polledChallenge) {
      polledChallenge = current?.id ?? ''
      polls = 0
    }
    schedule()
  })

  onBeforeUnmount(() => {
    stopPolling()
    stopMailPolling()
    cancelDetached(active.value)
    lifetime.abort()
  })

  return {
    loading, busy, checking, cooldownUntil, error, loadError, errorTarget, profileCredential, notice, summary, schools, applications, credentials, requests, cursors, profile,
    isStudentApplication, backToMethod, emailSentAt, mode, selectedSchool, selectedMethod, stage, kind, consent, active, email, materials, smsCode, form, removal, suggestion,
    school, availableMethods, manual, emailMethod, schoolPending, chooseStudy, chooseStage, writable, step, profileRequestId,
    asksKind, kindChoices, methodAllowed, chooseKind, chooseMethod, standing, standingApplication,
    transfer, transferAsking, transferChanged, transferRetry, agreeTransfer,
    reload, loadMore, selectSchool, selectMethod, selectMode, start, resume, submit, resendEmail, confirmEmail, refreshApplication,
    captured, removeMaterial, requestRemoval, suggest, showProfile, schoolName, continueSchool,
  }
}
