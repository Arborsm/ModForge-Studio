import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { saveFileContent } from '@platform/host/fileExport'
import { canUseDesktopHost, getPlatformPorts, invokeDesktop } from '@platform/host/runtime'

vi.mock('@platform/host/runtime', () => ({
  canUseDesktopHost: vi.fn(),
  getPlatformPorts: vi.fn(),
  invokeDesktop: vi.fn(),
}))

const request = {
  bytes: new Uint8Array([123, 125, 10]),
  dialog: {
    title: 'Export file',
    defaultPath: 'default.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  },
  fileName: 'default.json',
  mediaType: 'application/json',
}

describe('file export host API', () => {
  const saveFile = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPlatformPorts).mockReturnValue({ dialog: { saveFile } } as never)
  })

  it('downloads through the browser outside a desktop host', async () => {
    vi.mocked(canUseDesktopHost).mockReturnValue(false)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    await expect(saveFileContent(request)).resolves.toBe('saved')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(saveFile).not.toHaveBeenCalled()
    expect(invokeDesktop).not.toHaveBeenCalled()

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('stops cleanly when the native save dialog is cancelled', async () => {
    vi.mocked(canUseDesktopHost).mockReturnValue(true)
    saveFile.mockResolvedValue(null)

    await expect(saveFileContent(request)).resolves.toBe('cancelled')
    expect(invokeDesktop).not.toHaveBeenCalled()
  })

  it('writes the selected file through an exclusive Host Runtime mutation', async () => {
    vi.mocked(canUseDesktopHost).mockReturnValue(true)
    saveFile.mockResolvedValue('C:/Exports/default.json')
    vi.mocked(invokeDesktop).mockResolvedValue(undefined)

    await expect(saveFileContent(request)).resolves.toBe('saved')
    expect(saveFile).toHaveBeenCalledWith(request.dialog)
    expect(invokeDesktop).toHaveBeenCalledWith(
      'export_file',
      { outputPath: 'C:/Exports/default.json', contentBase64: 'e30K' },
      { kind: 'exclusiveMutation', resource: 'FileExport' },
    )
  })
})
