export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
    try {
      return await next(specifier + '.ts', context)
    } catch {}
  }
  return next(specifier, context)
}
