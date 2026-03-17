import type { BoardNode } from '@/store/types'
import { StickyNode } from './StickyNode'
import { TextNode } from './TextNode'
import { ShapeNode } from './ShapeNode'

interface NodeRendererProps {
  node: BoardNode
}

export function NodeRenderer({ node }: NodeRendererProps) {
  switch (node.type) {
    case 'sticky':
      return <StickyNode node={node} />
    case 'text':
      return <TextNode node={node} />
    case 'shape':
      return <ShapeNode node={node} />
    default:
      return null
  }
}
