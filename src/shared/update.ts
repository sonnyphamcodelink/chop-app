export type BackgroundUpdateState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'checking' }
  | {
      readonly phase: 'downloading'
      readonly tag: string
    }
  | {
      readonly phase: 'preparing'
      readonly tag: string
    }
  | {
      readonly phase: 'ready'
      readonly tag: string
    }
  | {
      readonly phase: 'failed'
      readonly message: string
    }
