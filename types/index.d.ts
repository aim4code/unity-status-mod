export type Connection = 'initializing' | 'idle' | 'connecting' | 'launching' | 'connected' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    'unity-status': {
      // m_EditorVersion from ProjectSettings/ProjectVersion.txt; null outside a Unity project
      projectVersion: string | null
      projectPath: string | null
      connection: Connection
      // what the live Editor reported on the last probe that answered
      editorVersion: string | null
      platform: string | null
      isHidden: boolean
      // the loading animation's step, advanced only while a check is running
      frame: number
    }
  }
}
