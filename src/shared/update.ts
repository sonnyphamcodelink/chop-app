export type UpdateWindowState =
  | {
      readonly phase: 'downloading'
      readonly tag: string
      readonly received: number
      readonly total: number
      readonly percent: number
    }
  | {
      readonly phase: 'preparing'
      readonly tag: string
      readonly message: string
    }
  | {
      readonly phase: 'failed'
      readonly tag: string
      readonly message: string
    }
