// (from: https://github.com/actions/github-script/blob/80a5e943b446817466ff17e8b61cb80848641ed6/src/async-function.ts)

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-interface
type AsyncFunctionArguments = {[key: string]: any}

export async function callAsyncFunction(
  args: AsyncFunctionArguments,
  source: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const fn = new AsyncFunction(...Object.keys(args), source)
  return fn(...Object.values(args))
}
