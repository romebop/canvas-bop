import React, { useEffect, useState, useRef } from 'react';

export type NodeId = string;

type Node = {
  id: NodeId;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  parentId?: NodeId;
};

type Edge = { from: NodeId; to: NodeId };

type Scene = {
  nodes: Record<NodeId, Node>;
  edges: Edge[];
};

const uid = () => Math.random().toString(36).slice(2, 9);

export default function ConversationGraph() {
  const [scene, setScene] = useState<Scene>(() => {
    const rootId = uid();
    const nodes: Record<NodeId, Node> = {
      [rootId]: { id: rootId, x: 100, y: 100, w: 240, h: 60, text: 'Ask me anything…' },
    };
    const edges: Edge[] = [];
    return { nodes, edges };
  });

  const [vp, setVp] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState<{ active: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: NodeId; dx: number; dy: number } | null>(null);
  const [selectedId, setSelectedId] = useState<NodeId | null>(null);
  const [hoverId, setHoverId] = useState<NodeId | null>(null);
  const [editing, setEditing] = useState<NodeId | null>(null);
  const editingValueRef = useRef<string>('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: NodeId | null } | null>(null);
  const contentEditableRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale });

  const onMouseDown = (e: React.MouseEvent) => {
    if (contextMenuRef.current?.contains(e.target as Node)) {
      return;
    }
    setContextMenu(null);
    setSelectedId(null);
    setEditing(null);
    setPanning({ active: true, sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y });
  };

  const onNodeMouseDown = (e: React.MouseEvent, nodeId: NodeId) => {
    e.stopPropagation();
    setSelectedId(nodeId);
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const node = scene.nodes[nodeId];
    setDragging({ id: nodeId, dx: x - node.x, dy: y - node.y });
  };

  const onDoubleClick = (e: React.MouseEvent, nodeId: NodeId) => {
    e.stopPropagation();
    setSelectedId(nodeId);
    setEditing(nodeId);
    editingValueRef.current = scene.nodes[nodeId]?.text || '';
  };

  const commitEdit = () => {
    if (!editing) return;
    setScene(s => ({
      ...s,
      nodes: { ...s.nodes, [editing]: { ...s.nodes[editing], text: editingValueRef.current } },
    }));
    setEditing(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selectedId && !editing) {
        e.preventDefault();
        setEditing(selectedId);
        editingValueRef.current = scene.nodes[selectedId]?.text || '';
      }
      if (editing && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      }
      if (e.key === 'Escape') {
        setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, editing]);

  useEffect(() => {
    if (editing && contentEditableRef.current) {
      const el = contentEditableRef.current;
      el.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const nodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id') || null;
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  };

  const addNode = () => {
    if (!contextMenu) return;
    const { x, y } = screenToWorld(contextMenu.x, contextMenu.y);
    const id = uid();
    const newNode: Node = { id, x, y, w: 220, h: 60, text: 'Ask me anything…' };
    setScene(s => ({ ...s, nodes: { ...s.nodes, [id]: newNode } }));
    setContextMenu(null);
  };

  const deleteNode = (nodeId: NodeId) => {
    setScene(s => {
      const { [nodeId]: _, ...newNodes } = s.nodes;
      const newEdges = s.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId);
      return { nodes: newNodes, edges: newEdges };
    });
    setContextMenu(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      setScene(s => {
        const node = s.nodes[dragging.id];
        if (!node) return s;
        return {
          ...s,
          nodes: {
            ...s.nodes,
            [dragging.id]: {
              ...node,
              x: x - dragging.dx,
              y: y - dragging.dy,
            },
          },
        };
      });
      return;
    }

    if (panning?.active) {
      setVp(prev => ({ ...prev, x: panning.ox + (e.clientX - panning.sx), y: panning.oy + (e.clientY - panning.sy) }));
    }
  };

  const onMouseUp = () => {
    setPanning(null);
    setDragging(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.currentTarget) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = -e.deltaY;
    const zoomIntensity = 0.0015;

    setVp(prevVp => {
      const newScale = Math.max(0.25, Math.min(3, prevVp.scale * (1 + delta * zoomIntensity)));

      const worldX = (mx - prevVp.x) / prevVp.scale;
      const worldY = (my - prevVp.y) / prevVp.scale;

      const newX = mx - worldX * newScale;
      const newY = my - worldY * newScale;

      return { x: newX, y: newY, scale: newScale };
    });
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        background: '#F8FAFC',
        overflow: 'hidden',
        cursor: panning?.active ? 'grabbing' : 'default',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    >
      <Grid vp={vp} />
      <div
        style={{
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`,
          transformOrigin: 'top left',
        }}
      >
        {Object.values(scene.nodes).map(node => {
          const isSelected = node.id === selectedId;
          const isHovered = node.id === hoverId;
          const isEditing = editing === node.id;

          return (
            <div
              key={node.id}
              data-node-id={node.id}
              onMouseDown={e => onNodeMouseDown(e, node.id)}
              onDoubleClick={e => onDoubleClick(e, node.id)}
              onMouseEnter={() => setHoverId(node.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                position: 'absolute',
                left: node.x,
                top: node.y,
                width: 'auto',
                height: 'auto',
                maxWidth: 560,
                background: 'white',
                border: `1px solid transparent`,
                borderRadius: 4,
                boxShadow: `0 0 0 ${isSelected ? 2 : 1}px ${isSelected ? '#6366F1' : isHovered ? '#A3A3A3' : '#9CA3AF'}`,
                padding: '8px 12px',
                boxSizing: 'border-box',
                cursor: dragging?.id === node.id ? 'grabbing' : 'grab',
                userSelect: isEditing ? 'none' : 'auto',
                zIndex: isSelected ? 1 : 0,
                color: '#0F172A',
                fontSize: 14,
                lineHeight: '20px',
                whiteSpace: 'pre-wrap',
              }}
            >
              <div
                ref={isEditing ? contentEditableRef : null}
                contentEditable={isEditing}
                suppressContentEditableWarning={true}
                onInput={e => editingValueRef.current = e.currentTarget.innerText}
                onBlur={commitEdit}
                style={{ outline: 'none' }}
              >
                {node.text}
              </div>
            </div>
          );
        })}
      </div>

      {contextMenu && (
        <div ref={contextMenuRef} style={{ position: 'absolute', left: contextMenu.x, top: contextMenu.y, background: 'white', border: '1px solid #A0A0A0', zIndex: 10, padding: 0 }}>
          <button
            onClick={addNode}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', borderRadius: 0, color: 'black', padding: '4px 20px', font: '14px system-ui, sans-serif', textAlign: 'left', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Add Node
          </button>
          {contextMenu.nodeId && (
            <button
              onClick={() => deleteNode(contextMenu.nodeId!)}
              style={{ display: 'block', width: '100%', background: 'none', border: 'none', borderRadius: 0, color: 'black', padding: '4px 20px', font: '14px system-ui, sans-serif', textAlign: 'left', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Delete Node
            </button>
          )}
        </div>
      )}

      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 8, zIndex: 3 }}>
        <button onClick={() => setVp({ x: 0, y: 0, scale: 1 })} style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', font: '12px Inter, system-ui, sans-serif', cursor: 'pointer' }}>Reset View</button>
      </div>

      <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 3, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', pointerEvents: 'none' }}>
        x: {vp.x.toFixed(2)}<br/>
        y: {vp.y.toFixed(2)}<br/>
        scale: {vp.scale.toFixed(2)}
      </div>
    </div>
  );
}

function Grid({ vp }: { vp: { x: number, y: number, scale: number } }) {
  const gridSize = 24 * vp.scale;
  const backgroundPosition = `${(vp.x % gridSize + gridSize) % gridSize}px ${(vp.y % gridSize + gridSize) % gridSize}px`;
  const backgroundImage = `linear-gradient(to right, #E5E7EB 1px, transparent 1px), linear-gradient(to bottom, #E5E7EB 1px, transparent 1px)`;
  const backgroundSize = `${gridSize}px ${gridSize}px`;

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundImage,
        backgroundSize,
        backgroundPosition,
      }}
    />
  );
}
