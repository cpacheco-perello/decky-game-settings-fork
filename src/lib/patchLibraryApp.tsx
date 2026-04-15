import { routerHook } from '@decky/api'
import { afterPatch, appDetailsClasses, createReactTreePatcher, findInReactTree } from '@decky/ui'
import type { ReactElement } from 'react'
import GameBatteryBadge from '../components/elements/GameBatteryBadge'

export const gameDetailsRoute = '/library/app/:appid'

const patchLibraryApp = () =>
  routerHook.addPatch(gameDetailsRoute, (tree: any) => {
    const routeProps = findInReactTree(tree, (value: any) => value?.renderFunc)
    if (!routeProps) {
      return tree
    }

    const patchHandler = createReactTreePatcher(
      [
        (reactTree: any) =>
          findInReactTree(reactTree, (value: any) => value?.props?.children?.props?.overview)?.props?.children,
      ],
      (_: Array<Record<string, unknown>>, ret?: ReactElement) => {
        const container = findInReactTree(
          ret,
          (value: ReactElement) =>
            Array.isArray(value?.props?.children) &&
            value?.props?.className?.includes?.(appDetailsClasses.InnerContainer)
        )

        if (typeof container !== 'object' || !Array.isArray(container?.props?.children)) {
          return ret
        }

        const alreadyInjected = container.props.children.some(
          (child: any) => child?.props?.['data-decky-game-settings-battery-badge']
        )
        if (alreadyInjected) {
          return ret
        }

        container.props.children.splice(
          1,
          0,
          <GameBatteryBadge
            key='decky-game-settings-battery-badge'
            data-decky-game-settings-battery-badge
          />
        )

        return ret
      }
    )

    afterPatch(routeProps, 'renderFunc', patchHandler)
    return tree
  })

export default patchLibraryApp