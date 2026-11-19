// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type Component, type SetupContext } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import example from '../../../contracts/contribution.example.json'
import { i18n } from '../../app/i18n'
import type {} from '../../app/router'
import { hostFetchKey } from '../../shared/api/transport'
import { createSessionStore, sessionKey } from '../../shared/session'
import MyReviewsView from '../academic/MyReviewsView.vue'
import ContributionsView from '../storage/ContributionsView.vue'
import { accessKey, createAccessStore } from './access'

vi.mock('./MeLayout.vue', () => ({
  default: (_: object, { slots }: SetupContext) => h('main', slots.default?.()),
}))
vi.mock('../../shared/ui/SheetDialog.vue', () => ({
  default: (props: { open: boolean }, { slots }: SetupContext) =>
    props.open ? h('section', { role: 'dialog' }, slots.default?.()) : null,
}))
vi.mock('../../shared/ui/AppDateTime.vue', () => ({
  default: (props: { modelValue: string }, { emit }: SetupContext) => h('input', {
    type: 'datetime-local',
    value: props.modelValue,
    onInput(event: Event) {
      if (event.target instanceof HTMLInputElement) emit('update:modelValue', event.target.value)
    },
  }),
}))

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

async function open(view: Component, path: string, fetcher: typeof fetch) {
  const router = createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:view}]})
  await router.push(path)
  const session = createSessionStore(fetcher)
  const root = document.createElement('div')
  const app = createApp(RouterView).use(router).use(i18n)
    .provide(hostFetchKey,fetcher).provide(sessionKey,session).provide(accessKey,createAccessStore(fetcher,session))
  document.body.append(root)
  app.mount(root)
  cleanups.push(() => {app.unmount();root.remove()})
  return root
}

function button(root: ParentNode,label: string) {
  const result = Array.from(root.querySelectorAll('button')).find(element => element.textContent?.trim() === label)
  if (!result) throw new Error('Expected action: '+label)
  return result
}

describe('member lifecycle actions', () => {
  it('keeps evidence after a refusal and appends it to the selected pending appeal',async()=>{
    const task = {id:'pending',school_id:'school',content_kind:'course',state:'waiting',can_appeal:false,revision:1,object_revision:1,
      created_at:'2026-11-19T01:00:00Z',updated_at:'2026-11-19T01:00:00Z',previous_task_id:'original',
      submission:{kind:'appeal',object_id:'entry',previous_task_id:'original',reason:'Original reason',evidence:['First record']}}
    const writes: unknown[]=[]
    const root=await open(MyReviewsView,'/me/reviews?tab=requests',async(input,init)=>{
      const path=String(input).split('?')[0]
      if(path==='/api/v1/moderation/tasks'){
        if(init?.method==='POST'){
          writes.push(JSON.parse(String(init.body)))
          if(writes.length===1)return Response.json({code:'invalid_input'},{status:400})
          return Response.json(task)
        }
        return Response.json([task,{...task,id:'ended',state:'applied'}])
      }
      if(path?.endsWith('overview'))return Response.json({review_count:0,draft_count:0,pending_courses:{state:'unavailable',count:0,items:[]}})
      return Response.json({items:[],missing_ids:[]})
    })
    const t=i18n.global.t
    await vi.waitFor(()=>expect(button(root,t('me.addEvidence'))).toBeDefined())
    expect(Array.from(root.querySelectorAll('button')).filter(el=>el.textContent?.trim()===t('me.addEvidence'))).toHaveLength(1)
    button(root,t('me.addEvidence')).click()
    await nextTick()
    const field=root.querySelector('textarea')
    if (!field) throw new Error('Missing evidence field')
    field.value='New statement'
    field.dispatchEvent(new Event('input',{bubbles:true}))
    await nextTick()
    button(root,t('common.submit')).click()
    await vi.waitFor(()=>expect(writes).toHaveLength(1))
    expect(field.value).toBe('New statement')
    await vi.waitFor(()=>expect(button(root,t('common.submit')).disabled).toBe(false))
    button(root,t('common.submit')).click()
    await vi.waitFor(()=>expect(root.textContent).toContain(t('me.evidenceAdded')))
    expect(writes[1]).toEqual({kind:'appeal',object_id:'entry',previous_task_id:'original',reason:'Original reason',evidence:['New statement']})
  })

  it('requires new consent and a future end date to reopen the exited binding',async()=>{
    const item={...example.page.items[0]!,state:'exited',desired_state:'exiting'}
    const writes: Array<{path:string;body:unknown}>=[]
    const root=await open(ContributionsView,'/me/storage',async(input,init)=>{
      const path=String(input).split('?')[0] ?? ''
      if(path.endsWith('/statistics'))return Response.json(example.statistics)
      if(path.endsWith('/policy'))return Response.json(example.policy)
      if(path.endsWith('/options'))return Response.json({...example.options,items:[]})
      if(init?.method==='POST'){
        writes.push({path,body:JSON.parse(String(init.body))})
        return Response.json({...item,state:'pending',desired_state:'active'})
      }
      return Response.json({...example.page,items:[item]})
    })
    const t=i18n.global.t
    await vi.waitFor(()=>expect(button(root,t('contribution.actions.reopen'))).toBeDefined())
    button(root,t('contribution.actions.reopen')).click()
    await nextTick()
    const form=root.querySelector('form')
    const until=form?.querySelector<HTMLInputElement>('[type="datetime-local"]')
    const consent=form?.querySelector<HTMLInputElement>('[type=checkbox]')
    if(!form || !until || !consent) throw new Error('Missing contribution conditions')
    expect(until.value).toBe('')
    expect(consent.checked).toBe(false)
    until.value=new Date(Date.now()+7*86400_000).toISOString().slice(0,16)
    until.dispatchEvent(new Event('input',{bubbles:true}))
    form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))
    await nextTick()
    expect(root.querySelector('[role=dialog]')).toBeNull()
    consent.click()
    await nextTick()
    form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))
    await nextTick()
    button(root,t('common.confirm')).click()
    await vi.waitFor(()=>expect(writes).toHaveLength(1))
    expect(writes[0]?.path).toContain('/'+item.id+'/')
    expect(writes[0]?.body).toMatchObject({action:'reopen',revision:item.revision,conditions:{limit_bytes:item.conditions.limit_bytes,personal_reserve:item.conditions.personal_reserve},consent:{accepted:true,version:example.policy.terms.version,digest:example.policy.terms.digest}})
  })
})
