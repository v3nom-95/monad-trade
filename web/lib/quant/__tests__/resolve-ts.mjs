// Runner for node --test on Node 22: resolves extensionless ./x imports inside
// quant/*.ts to ./x.ts, since Node ESM (unlike Next's bundler) requires extensions.
import { register } from 'node:module'

register('./ts-resolver.mjs', new URL('./ts-resolver.mjs', import.meta.url))
