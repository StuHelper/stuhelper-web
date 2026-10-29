const obj=(id,kind,name,extra={})=>({id,kind,name,school_id:'school',credits:null,aliases:[],revision:1,updated_at:'2026-10-27T00:00:00Z',...extra});
const school=obj('school','school','Test University');
const course=obj('course','course','Test Course',{department_id:'dept'});
const teacher=obj('teacher-a','teacher','Teacher A');
const otherTeacher=obj('teacher-b','teacher','Teacher B');
const terms=[obj('fall','term','Fall semester'),obj('spring','term','Spring semester')];
const offerings=[obj('offering-fall','term_course','Fall offering',{course_id:'course',term_id:'fall'}),obj('offering-spring','term_course','Spring offering',{course_id:'course',term_id:'spring'})];
const classes=[obj('class-one','class','Class One',{term_course_id:'offering-fall',category_id:'seminar',nature_id:'optional'})];
const schedules=[obj('schedule','schedule','Teaching time',{class_id:'class-one',time_text:'Monday 09:00',location:'Room A'})];
const directory={term_course:offerings,class:classes,schedule:schedules,school:[school],department:[obj('dept','department','Test College')],category:[obj('seminar','category','Test Seminar')],nature:[obj('optional','nature','Optional')],term:terms,course:[course],teacher:[teacher,otherTeacher]};
const dimensions=Array.from({length:5},()=>({level:3,samples:2,courses:1}));
const review={id:'review',root_id:'review',kind:'course',school_id:'school',target_id:'course',term_id:'fall',title:'A student review',body:'Useful course content.',ratings:[3,3,3,3,3],preview:false,author:{anonymous:true,handle:'anonymous'},revision:1,published_at:'2026-10-27T00:00:00Z',upvotes:0,downvotes:0,my_vote:0,mine:false,state:'published',can_edit:false};
const fulfill=(route,value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
export async function fixture(page){
  await page.route('**/api/v1/**',async route=>{
    const u=new URL(route.request().url()),p=u.pathname;
    if(p==='/api/v1/auth/session')return route.fallback();
    if(p==='/api/v1/catalog/objects'){
      const kind=u.searchParams.get('kind');let items=directory[kind]??[];
      if(kind==='term_course')items=items.filter(item=>(!u.searchParams.get('term_id')||item.term_id===u.searchParams.get('term_id'))&&(!u.searchParams.get('teacher_id')||item.term_id===(u.searchParams.get('teacher_id')==='teacher-a'?'fall':'spring')));
      if(kind==='teacher'&&u.searchParams.get('class_id'))items=[teacher];
      return fulfill(route,{items,next:''});
    }
    if(p==='/api/v1/catalog/objects/lookup'){const ids=(u.searchParams.get('ids')??'').split(',');const items=Object.values(directory).flat().filter(item=>ids.includes(item.id));return fulfill(route,{items,missing_ids:ids.filter(id=>!items.some(item=>item.id===id))});}
    if(p.endsWith('/summary')){const id=p.split('/').at(-2);const entry=Object.values(directory).flat().find(item=>item.id===id);return fulfill(route,{object:entry,school,department:entry.kind==='course'?directory.department[0]:null,categories:entry.kind==='course'?directory.category:[],natures:entry.kind==='course'?directory.nature:[],course_count:1,teacher_count:entry.kind==='course'?2:1,offering_count:entry.kind==='course'?2:1});}
    if(p.startsWith('/api/v1/catalog/objects/')){const id=p.split('/').at(-1);return fulfill(route,Object.values(directory).flat().find(v=>v.id===id)??course);}
    if(p==='/api/v1/catalog/me/enrollments')return fulfill(route,terms.map((term,i)=>({id:`enrollment-${i}`,subject:'synthetic',school_id:'school',course_id:'course',term_id:term.id,teacher_ids:[i===0?'teacher-a':'teacher-b'],active:true})));
    if(p==='/api/v1/reviews/compose'){
      const needsTerm=u.searchParams.get('kind')==='course'&&!u.searchParams.get('term_id');
      return fulfill(route,{allowed:!needsTerm,state:needsTerm?'choose_term':'ready',requirements:[{key:'login',state:'satisfied'},{key:'campus_eligibility',state:'satisfied'},{key:'phone_bound',state:'satisfied'}],teacher_ids:u.searchParams.get('kind')==='course'&&u.searchParams.get('term_id')?[u.searchParams.get('term_id')==='fall'?'teacher-a':'teacher-b']:[],identity:'choice',rule_version:'fixture'});
    }
    if(p==='/api/v1/reviews/presentation')return fulfill(route,{effective:{school_id:'school',revision:0,guest_preview:80,member_preview:160,preview_ratio:0.3,rating_texts:{}},configured:null,source:'default'});
    if(p==='/api/v1/reviews/statistics')return fulfill(route,{dimensions,courses:[{course_id:'course',dimensions}],next:'',from:u.searchParams.get('from'),until:u.searchParams.get('until')});
    if(p==='/api/v1/reviews'&&route.request().method()==='GET')return fulfill(route,{items:u.searchParams.get('kind')==='course'?[review]:[],next:''});
    if(p==='/api/v1/reviews/review')return fulfill(route,review);
    if(p==='/api/v1/reviews/me/entries')return fulfill(route,{items:[],next:''});
    if(p.startsWith('/api/v1/reviews/me/')||p==='/api/v1/moderation/tasks')return fulfill(route,[]);
    return fulfill(route,{code:'not_found'},404);
  });
}
