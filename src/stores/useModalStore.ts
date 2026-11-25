import { create } from 'zustand'

const useModalStore = create<{
  showModalBasic: boolean
  setShowModalBasic: (value: boolean) => void
  reset: () => void
}>((set) => ({
  showModalBasic: true,
  setShowModalBasic: (value) => set({ showModalBasic: value }),
  reset: () => set({ showModalBasic: true }),
}))

export default useModalStore
