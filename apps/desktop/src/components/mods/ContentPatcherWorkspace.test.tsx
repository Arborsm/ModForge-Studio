import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ContentPatcherWorkspace } from './ContentPatcherWorkspace'
import { getModWorkspaceCopy } from '../../lib/plugins/copy'
import type { WorkspacePluginCapability } from '../../lib/plugins/types'

const copy = getModWorkspaceCopy('en-US')

let latestReactFlowProps: Record<string, unknown> | null = null

vi.mock('@xyflow/react', async () => {
  const React = await import('react')
  return {
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    ReactFlow: (props: Record<string, unknown>) => {
      latestReactFlowProps = props
      const onDrop = props.onDrop as (event: React.DragEvent) => void
      const onDragOver = props.onDragOver as (event: React.DragEvent) => void
      return (
        <div data-testid="reactflow" onDrop={onDrop} onDragOver={onDragOver}>
          {props.children as React.ReactNode}
        </div>
      )
    },
    addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
    applyEdgeChanges: (changes: Array<{ id: string; type: string }>, edges: Array<{ id: string }>) => {
      const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id))
      return edges.filter((edge) => !removed.has(edge.id))
    },
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = React.useState(initial)
      return [nodes, setNodes, vi.fn()]
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial)
      return [edges, setEdges, vi.fn()]
    },
  }
})

function getReactFlowProps() {
  if (!latestReactFlowProps) {
    throw new Error('ReactFlow props not captured')
  }
  return latestReactFlowProps
}

function createDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (type: string, value: string) => {
      store[type] = value
    },
    getData: (type: string) => store[type] ?? '',
    effectAllowed: 'move',
    dropEffect: 'move',
  } as unknown as DataTransfer
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  latestReactFlowProps = null
})

function buildProps(): ComponentProps<typeof ContentPatcherWorkspace> {
  return {
    copy,
    pluginDefinition: {
      id: 'content-patcher' as const,
      pluginKind: 'content-patcher' as const,
      capabilities: ['edit', 'save', 'export', 'validate'] as WorkspacePluginCapability[],
      futureScopes: ['wizard'],
      getDisplayName: () => 'Content Patcher',
      getDescription: () => 'Test plugin',
    },
    projectDetail: {
      pluginKind: 'content-patcher' as const,
      capabilities: ['edit', 'save', 'export', 'validate'],
      summary: {
        id: 'seasonal-garden',
        name: 'Seasonal Garden',
        author: 'Aly',
        version: '1.2.0',
        description: 'A patch-heavy content pack',
        uniqueId: 'Aly.SeasonalGarden',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'SeasonalGarden',
        pluginKind: 'content-patcher' as const,
        absolutePath: 'E:\\Mods\\SeasonalGarden',
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
        status: 'ready' as const,
      },
      diagnostics: [
        {
          severity: 'warning' as const,
          message: 'One patch uses a broad target.',
          field: 'Changes[1].Target',
        },
      ],
      contentPatcher: {
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
        manifestJson: '{\n  "Name": "Seasonal Garden"\n}\n',
        contentJson: '{\n  "Changes": []\n}\n',
        format: '2.0.0',
        changeCount: 3,
        includeCount: 1,
        dynamicTokenCount: 2,
        configKeys: ['Season', 'Festival'],
        hasI18n: false,
        patches: [],
      },
    },
    gameRootPath: 'E:\\Games\\Stardew Valley',
    manifestEditor: {
      text: '{\n  "Name": "Seasonal Garden"\n}\n',
      value: {
        Name: 'Seasonal Garden',
        Author: 'Aly',
        Version: '1.2.0',
        UniqueID: 'Aly.SeasonalGarden',
        Description: 'A patch-heavy content pack',
        ContentPackFor: {
          UniqueID: 'Pathoschild.ContentPatcher',
        },
      },
      error: null,
    },
    contentEditor: {
      text: '{\n  "Changes": []\n}\n',
      value: {
        Format: '2.0.0',
        Changes: [
          {
            Action: 'EditImage',
            Target: 'Maps/spring_town',
            FromFile: 'assets/spring-town.png',
            LogName: 'Spring town',
            When: { Season: 'spring' },
          },
        ],
      },
      error: null,
    },
    contentSummary: {
      format: '2.0.0',
      changeCount: 3,
      includeCount: 1,
      dynamicTokenCount: 2,
      configKeys: ['Season', 'Festival'],
      patches: [
        {
          id: 'patch:0',
          action: 'EditImage',
          target: 'Maps/spring_town',
          fromFile: 'assets/spring-town.png',
          logName: 'Spring town',
          hasWhen: true,
          whenKeys: ['Season'],
          updateKeys: ['OnDayStarted'],
        },
      ],
    },
    selectedPatchId: 'patch:0',
    selectedPatch: {
      Action: 'EditImage',
      Target: 'Maps/spring_town',
      FromFile: 'assets/spring-town.png',
      LogName: 'Spring town',
      When: {
        Season: 'spring',
      },
    },
    hasUnsavedChanges: true,
    canPersist: true,
    diagnostics: [
      {
        severity: 'warning' as const,
        message: 'One patch uses a broad target.',
        field: 'Changes[1].Target',
      },
    ],
    patchWhenError: null,
    statusMessage: '3 mod projects detected.',
    lastSaveResult: {
      pluginKind: 'content-patcher' as const,
      targetPath: 'E:\\Exports\\SeasonalGarden',
      manifestPath: 'E:\\Exports\\SeasonalGarden\\manifest.json',
      contentPath: 'E:\\Exports\\SeasonalGarden\\content.json',
      diagnostics: [],
    },
    contentPatcherSnapshot: null,
    contentPatcherSimulation: null,
    simulationContext: {
      season: '',
      weather: '',
      relationship: '',
      config: {},
      installedMods: [],
      customTokens: {},
    },
    onSelectPatch: vi.fn(),
    onManifestFieldChange: vi.fn(),
    onManifestTextChange: vi.fn(),
    onContentTextChange: vi.fn(),
    onPatchFieldChange: vi.fn(),
    onPatchWhenChange: vi.fn(),
    onAddPatch: vi.fn(),
    onRemoveSelectedPatch: vi.fn(),
    onSaveProject: vi.fn(),
    onExportProject: vi.fn(),
    onSimulationContextChange: vi.fn(),
  } as unknown as ComponentProps<typeof ContentPatcherWorkspace>
}

describe('ContentPatcherWorkspace', () => {
  it('shows an empty state when no project detail is available', () => {
    const props = buildProps()
    render(<ContentPatcherWorkspace {...props} projectDetail={null} />)

    expect(screen.getByText(copy.noProject)).toBeTruthy()
  })

  it('renders the node workspace layout and simulation controls', () => {
    render(<ContentPatcherWorkspace {...buildProps()} />)

    expect(screen.getByText('Asset Library')).toBeTruthy()
    expect(screen.getByText('Node Canvas')).toBeTruthy()
    expect(screen.getByText('Node Inspector')).toBeTruthy()
    expect(screen.getByText('content.json Preview')).toBeTruthy()

    expect(screen.getByLabelText('Simulation Season')).toBeTruthy()
    expect(screen.getByLabelText('Simulation Weather')).toBeTruthy()
    expect(screen.getByLabelText('Simulation Relationship')).toBeTruthy()
  })

  it('lists assets, targets, and shows a live JSON preview', () => {
    render(<ContentPatcherWorkspace {...buildProps()} />)

    expect(screen.getAllByText('assets/spring-town.png').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Maps/spring_town').length).toBeGreaterThan(0)

    const preview = screen.getByLabelText('content.json preview')
    expect(preview.textContent).toContain('"Action": "EditImage"')
  })

  it('writes back asset drops to FromFile', () => {
    const props = buildProps()
    props.onPatchFieldChange = vi.fn()

    render(<ContentPatcherWorkspace {...props} />)

    const transfer = createDataTransfer()
    transfer.setData('application/x-modforge-node', JSON.stringify({ kind: 'asset', value: 'assets/spring-town.png' }))
    fireEvent.drop(screen.getByTestId('reactflow'), { dataTransfer: transfer })

    expect(props.onPatchFieldChange).toHaveBeenCalledWith('FromFile', 'assets/spring-town.png')
  })

  it('writes back condition drops using simulation values', () => {
    const props = buildProps()
    props.onPatchWhenChange = vi.fn()

    render(<ContentPatcherWorkspace {...props} />)

    fireEvent.change(screen.getByLabelText('Simulation Season'), { target: { value: 'winter' } })

    const transfer = createDataTransfer()
    transfer.setData('application/x-modforge-node', JSON.stringify({ kind: 'condition', value: 'Season' }))
    fireEvent.drop(screen.getByTestId('reactflow'), { dataTransfer: transfer })

    expect(props.onPatchWhenChange).toHaveBeenCalled()
    const payload = (props.onPatchWhenChange as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(String(payload)).toContain('"Season": "winter"')
  })

  it('writes back connections and removals to patch fields', () => {
    const props = buildProps()
    props.onPatchFieldChange = vi.fn()

    render(<ContentPatcherWorkspace {...props} />)

    const reactFlowProps = getReactFlowProps() as any
    const nodes = reactFlowProps.nodes as Array<{ id: string; data: { kind: string; assetPath?: string; target?: string } }>
    const edges = reactFlowProps.edges as Array<{ id: string; data?: { edgeType?: string } }>

    const assetNode = nodes.find((node) => node.data.kind === 'asset')
    const actionNode = nodes.find((node) => node.data.kind === 'action')
    expect(assetNode && actionNode).toBeTruthy()

    reactFlowProps.onConnect?.({ source: assetNode?.id, target: actionNode?.id })
    expect(props.onPatchFieldChange).toHaveBeenCalledWith('FromFile', assetNode?.data.assetPath)

    const dataEdge = edges.find((edge) => edge.data?.edgeType === 'data')
    expect(dataEdge).toBeTruthy()
    reactFlowProps.onEdgesChange?.([{ id: dataEdge?.id, type: 'remove' }])
    expect(props.onPatchFieldChange).toHaveBeenCalledWith('Target', '')
  })

  it('renders backend patch statuses and include tree entries', () => {
    const props = buildProps() as any
    props.contentPatcherSnapshot = {
      summary: {
        name: 'Seasonal Garden',
        uniqueId: 'Aly.SeasonalGarden',
        absolutePath: 'E:\\Mods\\SeasonalGarden',
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
      },
      sources: [
        { path: 'content.json', absolutePath: 'E:\\Mods\\SeasonalGarden\\content.json', rawJson: '{ "Changes": [] }' },
        {
          path: 'patches/spring.json',
          absolutePath: 'E:\\Mods\\SeasonalGarden\\patches\\spring.json',
          rawJson: '{ "Changes": [] }',
        },
      ],
      includeTree: [
        { sourcePath: 'content.json', includedPath: 'patches/spring.json' },
      ],
      diagnostics: [],
    }
    props.contentPatcherSimulation = {
      plan: {
        patches: [
          {
            id: 'content.json->patches/spring.json#include:0:0#target:0#from:0',
            sourcePath: 'content.json->patches/spring.json',
            logName: 'Spring patch',
            action: 'EditData',
            target: 'Data/Objects',
            fromFile: null,
            when: { Season: 'spring' },
          },
        ],
      },
      patchStatuses: [
        {
          patchId: 'content.json->patches/spring.json#include:0:0#target:0#from:0',
          status: 'indeterminate',
          reasons: ['Season is not available in the simulation context'],
        },
      ],
      diagnostics: [],
    }

    render(<ContentPatcherWorkspace {...props} />)

    expect(screen.getByText('patches/spring.json')).toBeTruthy()
    expect(screen.getByText('indeterminate')).toBeTruthy()
    expect(screen.getByText('Season is not available in the simulation context')).toBeTruthy()
  })
})
