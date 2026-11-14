import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { ApiError, errorCode } from '../../shared/api/errors'
import { useVerification, type Application, type Credential, type EmailChallenge, type Kind, type Material, type Method, type RemovalRequest, type School, type Schemas, type Stage, type StudentProfile, type Summary } from './api'

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
  const error = ref('')
  const loadError = ref('')
  const errorTarget = ref<ErrorTarget>('form')
  const profileCredentialId = ref('')
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
  const writable = computed(() => !!active.value && ['in_progress', 'supplement_required'].includes(active.value.state) && !schoolPending.value)

  function fail(failure: unknown, target: ErrorTarget = 'form') {
    errorTarget.value = target
    error.value = errorCode(failure)
  }

  function merge<T extends { id: string }>(current: T[], rows: T[]) {
    return [...new Map([...current, ...rows].map((row) => [row.id, row])).values()]
  }

  async function reload() {
    loading.value = true
    loadError.value = ''
    profile.value = undefined
    profileCredentialId.value = ''
    try {
      const signal = lifetime.signal
      const [s, a, c, r, state] = await Promise.all([
        api.list('School', '/api/v1/verification/schools', { limit: 100, signal }),
        api.list('Application', '/api/v1/verification/applications', { signal }),
        api.list('Credential', '/api/v1/verification/credentials', { signal }),
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
    summary.value = undefined
    applications.value = []
    credentials.value = []
    requests.value = []
    profile.value = undefined
    profileCredentialId.value = ''
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
    stopPolling()
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
    const body: Schemas['CreateApplication'] = { school_id: school.value.id, method: selectedMethod.value, stage: chooseStudy.value ? stage.value : 'unknown', kind: chooseStudy.value ? kind.value : 'unknown', consent: true, notice_version: school.value.notice_version }
    active.value = await api.write('Application', '/api/v1/verification/applications', body)
    await reload()
  })

  const resume = (application: StudentApplication) => action(async () => {
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
      try {
        email.value = await api.get('EmailChallenge', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/email`)
      } catch (failure) {
        if (errorCode(failure) !== 'not_found') throw failure
      }
    }
  })

  const submit = () => action(async () => {
    if (mode.value === 'identity') {
      if (!school.value || !consent.value) throw new ApiError('invalid_input')
      const body: Schemas['IdentityInput'] = { student_id: form.student_id, name: form.name, document_number: form.document_number, password: '', school_id: school.value.id, notice_version: school.value.notice_version, consent: true }
      summary.value = await api.write('Summary', '/api/v1/verification/identity', body)
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
      email.value = await api.write('EmailChallenge', `${path}/email`, body)
    } else {
      const body: Schemas['VerifyInput'] = { student_id: form.student_id, name: selectedMethod.value === 'school_sso' ? '' : form.name, document_number: form.document_number, password: form.password }
      active.value = await api.write('Application', `${path}/verify`, body)
      form.document_number = ''
      notice.value = active.value.state === 'approved' ? 'verified' : 'schoolProgress'
    }
    await reload()
  })

  const confirmEmail = () => action(async () => {
    if (!active.value) return
    active.value = await api.write('Application', `/api/v1/verification/applications/${encodeURIComponent(active.value.id)}/email/confirm`, { code: form.code })
    form.code = ''
    notice.value = 'verified'
    await reload()
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
    materials.value = [...materials.value, material]
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
    cancelDetached(active.value)
    lifetime.abort()
  })

  return {
    loading, busy, error, loadError, errorTarget, profileCredential, notice, summary, schools, applications, credentials, requests, cursors, profile,
    isStudentApplication, mode, selectedSchool, selectedMethod, stage, kind, consent, active, email, materials, smsCode, form, removal, suggestion,
    school, availableMethods, manual, emailMethod, schoolPending, chooseStudy, writable,
    reload, loadMore, selectSchool, selectMethod, selectMode, start, resume, submit, confirmEmail, refreshApplication,
    captured, removeMaterial, requestRemoval, suggest, showProfile, schoolName, continueSchool,
  }
}
