/**
 * Optional chat, grounded in the character's real figures.
 *
 * The model is never asked to compute anything — it is handed what this project
 * already derived and told to answer only from it. See context.ts for why that
 * matters and provider.ts for where the API key lives.
 */

export * from './context.js'
export * from './provider.js'
