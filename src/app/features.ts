/**
 * Product switches that are not module capabilities. "My courses" reads the
 * person's enrollment records, which needs the person's explicit consent; until
 * that consent flow exists the page, its entries and its background reads stay off.
 * Review eligibility is still checked on the server and is unaffected.
 */
export const myCoursesEnabled = false
