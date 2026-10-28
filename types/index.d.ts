export type Connection =
  | 'checking'
  | 'idle'
  | 'launching'
  | 'connected'
  | 'failed'
  // an Editor holds the project open but does not answer yet: loading, importing
  | 'starting'
  // an Editor holds the project open and cannot answer: no Pipeline package, or Safe Mode
  | 'no-pipeline'
  | 'installing'
  | 'safe-mode'

declare module 'claude-code' {
  interface PluginState {
    'unity-status': {
      // m_EditorVersion from ProjectSettings/ProjectVersion.txt; null outside a Unity project
      projectVersion: string | null
      connection: Connection
      // the Editor's active build target on the last check that got an answer
      platform: string | null
      isHidden: boolean
    }
  }
}
