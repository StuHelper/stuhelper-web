import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { AcademicError, call, Mutation, validates, objectOptions } from './api'
afterEach(()=>vi.unstubAllGlobals())
describe('academic boundary',()=>{
  it('rejects unexpected identity fields and incomplete response shapes',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[],next:'',subject:'secret'})))
    await expect(call('catalog','/objects','Page',{},fetcher)).rejects.toMatchObject({code:'incompatible'})
    expect(validates([1,2],{type:'array',minItems:5,items:{type:'integer'}},{})).toBe(false)
  })
  it('preserves the original request after unknown outcomes and accepts reactive input',async()=>{
    const requests: RequestInit[]=[]
    const fetcher=vi.fn().mockImplementation(async(_path:string,init:RequestInit)=>{
      requests.push(init)
      if(requests.length===1) throw new TypeError('disconnected after commit')
      return new Response(JSON.stringify({id:'review',state:'published',revision:1}))
    })
    vi.stubGlobal('fetch',fetcher)
    const mutation=new Mutation(), body=reactive({title:'Original',ratings:[1,2,3,4,5]})
    await expect(mutation.run('reviews','','Result',body)).rejects.toMatchObject({uncertain:true})
    body.title='Changed locally'
    await mutation.run('reviews','','Result',body)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.body).toBe(requests[0]?.body)
    expect(requests[1]?.headers).toEqual(requests[0]?.headers)
    expect(mutation.uncertain).toBe(false)
  })
  it('keeps authorization rejection distinct from an unavailable service',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'enrollment_required'}),{status:403}))
    await expect(call('reviews','','Result',{body:{},key:'key'},fetcher)).rejects.toEqual(new AcademicError('enrollment_required',false))
  })
  it('loads selection lists past the first page without losing their filter',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({items:[],next:'page-two'}))).mockResolvedValueOnce(new Response(JSON.stringify({items:[],next:''})))
    vi.stubGlobal('fetch',fetcher)
    await objectOptions({kind:'teacher',course_id:'course'})
    expect(fetcher).toHaveBeenCalledTimes(2)
    const second=new URL(fetcher.mock.calls[1]?.[0] as string,'https://example.test')
    expect(second.searchParams.get('after')).toBe('page-two')
    expect(second.searchParams.get('course_id')).toBe('course')
  })
  it('rejects a repeated selection cursor instead of looping or exposing a partial list',async()=>{
    const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({items:[],next:'same'})))
    vi.stubGlobal('fetch',fetcher)
    await expect(objectOptions({kind:'category'})).rejects.toMatchObject({code:'incompatible'})
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
