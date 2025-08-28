import React, { useEffect, useMemo, useRef, useState } from 'react';

// --- Types ---
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

// --- Utils ---
const DPR = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1); // get browser device pixel ratio
const uid = () => Math.random().toString(36).slice(2, 9);

const measureText = (() => { // get width and height of node based on text
  const cache = new Map<string, { w: number; h: number }>(); 
  return (ctx: CanvasRenderingContext2D, text: string, font = '14px Inter, system-ui, sans-serif') => {
    const key = font + '|' + text;
    if (cache.has(key)) return cache.get(key)!;
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = metrics.width + 16;
    const h = 20 + 12;
    ctx.restore();
    const val = { w, h };
    cache.set(key, val);
    return val;
  };
})();

function pointInRect(px: number, py: number, n: Node): boolean {
  return px >= n.x && px <= n.x + n.w && py >= n.y && py <= n.y + n.h;
}

// --- Component ---
export default function ConversationCanvas() {
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [scene, setScene] = useState<Scene>(() => {
    const rootId = uid();
    const childId = uid();
    const nodes: Record<NodeId, Node> = {
      [rootId]: { id: rootId, x: 100, y: 100, w: 240, h: 60, text: 'Ask me anything…' },
      [childId]: { id: childId, x: 380, y: 140, w: 260, h: 60, text: 'LLM reply will stream here.' },
    };
    const edges: Edge[] = [{ from: rootId, to: childId }];
    return { nodes, edges };
  });

  const [vp, setVp] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState<{ active: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [editing, setEditing] = useState<{ id: NodeId; value: string } | null>(null);
  const [hoverId, setHoverId] = useState<NodeId | null>(null);
  const [selectedId, setSelectedId] = useState<NodeId | null>(null);

  // make canvas responsive: set initial size and make it resize
  useEffect(() => {
    const el = canvasRef.current;
    const parent = containerRef.current;
    if (!el || !parent) return;

    let raf = 0;
    const resize = () => {
      const dpr = DPR();
      const { clientWidth: w, clientHeight: h } = parent;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.max(1, Math.floor(h * dpr));
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      const ctx = el.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(resize);
    });
    ro.observe(parent);
    resize();
    return () => ro.disconnect();
  }, []);

  const worldToScreen = (x: number, y: number) => ({ sx: (x + vp.x) * vp.scale, sy: (y + vp.y) * vp.scale });
  const screenToWorld = (sx: number, sy: number) => ({ x: sx / vp.scale - vp.x, y: sy / vp.scale - vp.y });

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H, vp);

    // draw edges
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#C7CBD1';
    scene.edges.forEach(e => {
      const a = scene.nodes[e.from];
      const b = scene.nodes[e.to];
      if (!a || !b) return;
      const { sx: ax, sy: ay } = worldToScreen(a.x + a.w / 2, a.y + a.h / 2);
      const { sx: bx, sy: by } = worldToScreen(b.x + b.w / 2, b.y + b.h / 2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    });

    // draw nodes
    Object.values(scene.nodes).forEach(n => {
      const { w, h } = measureText(ctx, n.text);
      if (w !== n.w || h !== n.h) n.w = w, n.h = h;
      const { sx, sy } = worldToScreen(n.x, n.y);

      const radius = 10;
      roundRect(ctx, sx, sy, n.w, n.h, radius);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = n.id === selectedId ? '#6366F1' : n.id === hoverId ? '#A3A3A3' : '#E5E7EB';
      ctx.lineWidth = n.id === selectedId ? 2 : 1;
      ctx.stroke();

      ctx.save();
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.textBaseline = 'top';
      ctx.fillText(n.text, sx + 8, sy + 6, Math.max(0, n.w - 16));
      ctx.restore();
    });
  };

  useEffect(() => { draw(); }, [scene, vp, hoverId, selectedId]);

  const onWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = -e.deltaY;
    const zoomIntensity = 0.0015;
    const newScale = clamp(vp.scale * (1 + delta * zoomIntensity), 0.25, 3);

    const worldBefore = screenToWorld(mx, my);
    setVp(prev => {
      const worldAfter = screenToWorld(mx, my);
      const dx = worldAfter.x - worldBefore.x;
      const dy = worldAfter.y - worldBefore.y;
      return { x: prev.x + dx, y: prev.y + dy, scale: newScale };
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);

    const hit = Object.values(scene.nodes).reverse().find(n => pointInRect(x, y, n));
    if (hit) {
      setSelectedId(hit.id);
      setPanning(null);
      if (e.detail === 2) startEditing(hit.id);
    } else {
      setSelectedId(null);
      setPanning({ active: true, sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);

    const hit = Object.values(scene.nodes).reverse().find(n => pointInRect(x, y, n));
    setHoverId(hit?.id || null);

    if (panning?.active) {
      setVp(prev => ({ ...prev, x: panning.ox + (e.clientX - panning.sx) / prev.scale, y: panning.oy + (e.clientY - panning.sy) / prev.scale }));
    }
  };

  const onMouseUp = () => setPanning(null);
  const onMouseLeave = () => setPanning(null);

  const startEditing = (id: NodeId) => {
    const n = scene.nodes[id];
    if (!n) return;
    setEditing({ id, value: n.text });
  };

  const commitEdit = () => {
    if (!editing) return;
    setScene(s => ({
      ...s,
      nodes: { ...s.nodes, [editing.id]: { ...s.nodes[editing.id], text: editing.value } },
    }));
    setEditing(null);
  };

  const addChild = async (parentId: NodeId, seedText = '') => {
    const parent = scene.nodes[parentId];
    if (!parent) return;
    const id = uid();
    const child: Node = { id, x: parent.x + parent.w + 120, y: parent.y, w: 220, h: 60, text: seedText };
    setScene(s => ({ nodes: { ...s.nodes, [id]: child }, edges: [...s.edges, { from: parentId, to: id }] }));

    for await (const chunk of fakeStream('This text is streaming token-by-token…')) {
      setScene(s => ({ ...s, nodes: { ...s.nodes, [id]: { ...s.nodes[id], text: (s.nodes[id]?.text || '') + chunk } } }));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selectedId && !editing) {
        addChild(selectedId, '');
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

  const editorStyle = useMemo(() => {
    if (!editing) return { display: 'none' } as React.CSSProperties;
    const n = scene.nodes[editing.id];
    if (!n) return { display: 'none' } as React.CSSProperties;
    const { sx, sy } = worldToScreen(n.x, n.y);
    return {
      position: 'absolute' as const,
      left: sx + 6,
      top: sy + 4,
      width: n.w - 12,
      height: n.h - 8,
      font: '14px Inter, system-ui, sans-serif',
      color: '#0F172A',
      border: '1px solid #6366F1',
      borderRadius: 8,
      padding: '6px 8px',
      outline: 'none',
      resize: 'none' as const,
      background: '#fff',
      zIndex: 2,
    };
  }, [editing, vp]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100vh', background: '#F8FAFC', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block', cursor: panning?.active ? 'grabbing' : 'default' }}
      />

      {editing && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
          onBlur={commitEdit}
          style={editorStyle}
        />
      )}

      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 8, zIndex: 3 }}>
        <button onClick={() => setVp(v => ({ ...v, x: 0, y: 0, scale: 1 }))} style={btnStyle}>Reset View</button>
        <button onClick={() => selectedId && startEditing(selectedId)} style={btnStyle}>Edit</button>
        <button onClick={() => selectedId && addChild(selectedId)} style={btnStyle}>Add Child (Enter)</button>
      </div>
    </div>
  );
}

// --- Helpers ---
function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, vp: { x: number; y: number; scale: number }) {
  ctx.save();
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, W, H);

  const grid = 24 * vp.scale;
  const offsetX = (vp.x * vp.scale) % grid;
  const offsetY = (vp.y * vp.scale) % grid;

  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -offsetX; x < W; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = -offsetY; y < H; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

async function* fakeStream(text: string) {
  for (const ch of text) {
    await new Promise(r => setTimeout(r, 12));
    yield ch;
  }
}

const btnStyle: React.CSSProperties = {
  background: '#111827',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '8px 12px',
  font: '12px Inter, system-ui, sans-serif',
  cursor: 'pointer',
};