export type UnityInfo = {
  version: string
  platform: string
  isCompiling: boolean
  isBuilding: boolean
  // false when the last probe got no answer (domain reload, a blocking build, Editor closed)
  isResponding: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'unity-status': {
      // set once a unity-cli call of Claude's has been followed by a probe the Editor answered
      isConnected: boolean
      projectPath: string | null
      info: UnityInfo | null
      isHidden: boolean
    }
  }
}
