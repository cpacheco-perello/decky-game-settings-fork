import { ReactRouter } from '@decky/ui'

export const useParams = Object.values(ReactRouter).find((value) =>
  /return (\w)\?\1\.params:{}/.test(`${value}`)
) as <T>() => T