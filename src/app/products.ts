/**
 * Products that run on their own sites. This site only introduces them and
 * links out. Product names are brand names and stay the same in every language.
 */
export const products = {
  campus: { name: 'StuHelper Campus' },
  // The page path is not /api: that prefix belongs to the business API behind the same origin.
  api: { path: '/newapi', name: 'API', fullName: 'StuHelper API', host: 'newapi.stuhelper.com', url: 'https://newapi.stuhelper.com' },
  store: { name: 'Store', fullName: 'StuHelper Store', host: 'store.stuhelper.org', url: 'https://store.stuhelper.org' },
  sso: { name: 'SSO' },
} as const
