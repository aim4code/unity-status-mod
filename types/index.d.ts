export type Connection = 'checking' | 'idle' | 'launching' | 'connected' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    'unity-status': {
      // m_EditorVersion from ProjectSettings/ProjectVersion.txt; null outside a Unity project
      projectVersion: string | null
      projectPath: string | null
      connection: Connection
      // the Editor's active build target on the last check that got an answer
      platform: string | null
      isHidden: boolean
    }
  }
}
