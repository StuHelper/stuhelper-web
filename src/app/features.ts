/**
 * Product switches that are not module capabilities. "My courses" reads the
 * person's enrollment records, which needs the person's explicit consent; until
 * that consent flow exists the page, its entries and its background reads stay off.
 * Review eligibility is still checked on the server and is unaffected.
 */
export const myCoursesEnabled = false

/**
 * The teacher directory. The server returns only teachers marked by the catalog
 * module (taught a recorded class, or matched to the school's faculty homepage
 * site), from backend v0.1.27 / Next v0.1.21 on. The switch stays so the list can
 * be turned off again without touching every entry point.
 */
export const teacherDirectoryEnabled = true
