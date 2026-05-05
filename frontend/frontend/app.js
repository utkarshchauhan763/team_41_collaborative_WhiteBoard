const { useEffect, useMemo, useRef, useState } = React;
const html = htm.bind(React.createElement);

const BOARD_WIDTH = 2200;
const BOARD_HEIGHT = 1400;
const CURSOR_FRAME_MS = 40;
const TOOL_SHORTCUTS = "Shortcuts: P R C A N V Ctrl+Z Ctrl+Y";

function randomColor() {
  return `#${Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, "0")}`;
}

function generateRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}-${Date.now()
    .toString(36)
    .slice(-4)}`;
}

function createClientState() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");
  const resolvedRoomId = roomFromUrl || generateRoomId();

  return {
    roomId: resolvedRoomId,
    requestedRole: params.get("role") || "editor",
    name: localStorage.getItem("whiteboard-name") || "",
    clientId: crypto.randomUUID(),
    color: randomColor()
  };
}

function App() {
  const initial = useMemo(createClientState, []);

  const [name, setName] = useState(initial.name);
  const [roomInput, setRoomInput] = useState(initial.roomId);
  const [requestedRole, setRequestedRole] = useState(initial.requestedRole);
  const [roomId, setRoomId] = useState(initial.roomId);
  const [role, setRole] = useState("editor");
  const [tool, setTool] = useState("pen");
  const [participants, setParticipants] = useState([]);
  const [comments, setComments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [cursors, setCursors] = useState([]);
  const [objects, setObjects] = useState([]);
  const [currentObject, setCurrentObject] = useState(null);
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const [connectionLive, setConnectionLive] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [viewport, setViewport] = useState({ x: 120, y: 110, scale: 0.62 });

  const socketRef = useRef(null);
  const boardFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(viewport);
  const roleRef = useRef(role);
  const roomIdRef = useRef(roomId);
  const requestedRoleRef = useRef(requestedRole);
  const nameRef = useRef(name);
  const objectsRef = useRef(objects);
  const notesRef = useRef(notes);
  const historyPastRef = useRef(historyPast);
  const historyFutureRef = useRef(historyFuture);
  const currentObjectRef = useRef(currentObject);
  const lastCursorSentAtRef = useRef(0);
  const isPanningRef = useRef(false);
  const panOriginRef = useRef(null);
  const noteDragRef = useRef(null);
  const clientRef = useRef(initial);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    requestedRoleRef.current = requestedRole;
  }, [requestedRole]);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    historyPastRef.current = historyPast;
  }, [historyPast]);

  useEffect(() => {
    historyFutureRef.current = historyFuture;
  }, [historyFuture]);

  useEffect(() => {
    currentObjectRef.current = currentObject;
  }, [currentObject]);

  function canEdit(nextRole = roleRef.current) {
    return nextRole === "owner" || nextRole === "editor";
  }

  function canManage(nextRole = roleRef.current) {
    return nextRole === "owner";
  }

  function send(payload) {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function setParticipantsAndRole(nextParticipants) {
    setParticipants(nextParticipants);
    const self = nextParticipants.find(
      (participant) => participant.id === clientRef.current.clientId
    );
    if (self) {
      setRole(self.role);
    }
  }

  function wsUrl(nextRoomId, nextRole) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({
      room: nextRoomId,
      clientId: clientRef.current.clientId,
      name: nameRef.current || "Guest",
      color: clientRef.current.color,
      role: nextRole
    });
    return `${protocol}//${window.location.host}/ws?${query.toString()}`;
  }

  function connectToRoom(nextRoomId, nextRole) {
    localStorage.setItem("whiteboard-name", nameRef.current || "Guest");

    if (socketRef.current) {
      socketRef.current.close();
    }

    const socket = new WebSocket(wsUrl(nextRoomId, nextRole));
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnectionLive(true));
    socket.addEventListener("close", () => setConnectionLive(false));

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === "room:snapshot") {
        setObjects(payload.objects || []);
        setNotes(payload.notes || []);
        setComments(payload.comments || []);
        setParticipantsAndRole(payload.participants || []);
        setSavedAt(payload.savedAt || null);
        setCursors([]);
        return;
      }

      if (payload.type === "participants:update") {
        setParticipantsAndRole(payload.participants || []);
        return;
      }

      if (payload.type === "role:assigned") {
        setRole(payload.role);
        return;
      }

      if (payload.type === "object:add") {
        setObjects((prev) => [...prev, payload.object]);
        return;
      }

      if (payload.type === "object:remove") {
        setObjects((prev) =>
          prev.filter((object) => object.id !== payload.objectId)
        );
        return;
      }

      if (payload.type === "note:add") {
        setNotes((prev) => [...prev, payload.note]);
        return;
      }

      if (payload.type === "note:update") {
        setNotes((prev) =>
          prev.map((note) => (note.id === payload.note.id ? payload.note : note))
        );
        return;
      }

      if (payload.type === "note:remove") {
        setNotes((prev) => prev.filter((note) => note.id !== payload.noteId));
        return;
      }

      if (payload.type === "comment:add") {
        setComments((prev) => [...prev, payload.comment]);
        return;
      }

      if (payload.type === "cursor:move") {
        setCursors((prev) => {
          const filtered = prev.filter(
            (cursor) => cursor.clientId !== payload.cursor.clientId
          );
          return [...filtered, payload.cursor];
        });
        return;
      }

      if (payload.type === "cursor:remove") {
        setCursors((prev) =>
          prev.filter((cursor) => cursor.clientId !== payload.clientId)
        );
        return;
      }

      if (payload.type === "board:clear") {
        setObjects([]);
        setNotes([]);
        setComments([]);
        setHistoryPast([]);
        setHistoryFuture([]);
      }
    });
  }

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState(
        {},
        "",
        `?room=${encodeURIComponent(roomIdRef.current)}&role=${encodeURIComponent(
          requestedRoleRef.current
        )}`
      );
    }
    connectToRoom(roomIdRef.current, requestedRoleRef.current);
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    canvas.width = BOARD_WIDTH * ratio;
    canvas.height = BOARD_HEIGHT * ratio;
    canvas.style.width = `${BOARD_WIDTH}px`;
    canvas.style.height = `${BOARD_HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    objects.forEach((object) => drawObject(ctx, object));
    if (currentObject) {
      drawObject(ctx, currentObject);
    }
  }, [objects, currentObject]);

  useEffect(() => {
    function handleKeyboard(event) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        undo();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "y" ||
          (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        redo();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "p") setTool("pen");
      if (key === "v") setTool("pan");
      if (key === "r") setTool("rectangle");
      if (key === "c") setTool("ellipse");
      if (key === "a") setTool("arrow");
      if (key === "n") setTool("note");
    }

    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("pointerup", stopInteraction);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("pointerup", stopInteraction);
    };
  }, []);

  function pushHistory(entry) {
    setHistoryPast((prev) => [...prev, entry]);
    setHistoryFuture([]);
  }

  function addObject(object, options = {}) {
    setObjects((prev) => [...prev, object]);
    if (!options.remote) {
      pushHistory({ type: "object:add", object });
      send({ type: "object:add", object });
    }
  }

  function removeObjectById(objectId, options = {}) {
    const removed = objectsRef.current.find((object) => object.id === objectId);
    setObjects((prev) => prev.filter((object) => object.id !== objectId));
    if (!options.remote && removed) {
      send({ type: "object:remove", objectId });
    }
    return removed;
  }

  function addNote(note, options = {}) {
    setNotes((prev) => [...prev, note]);
    if (!options.remote) {
      pushHistory({ type: "note:add", note });
      send({ type: "note:add", note });
    }
  }

  function removeNoteById(noteId, options = {}) {
    const removed = notesRef.current.find((note) => note.id === noteId);
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
    if (!options.remote && removed) {
      send({ type: "note:remove", noteId });
    }
    return removed;
  }

  function worldPointFromEvent(event) {
    const rect = boardFrameRef.current.getBoundingClientRect();
    const nextViewport = viewportRef.current;
    return {
      x: Math.max(
        0,
        Math.min(
          BOARD_WIDTH,
          (event.clientX - rect.left - nextViewport.x) / nextViewport.scale
        )
      ),
      y: Math.max(
        0,
        Math.min(
          BOARD_HEIGHT,
          (event.clientY - rect.top - nextViewport.y) / nextViewport.scale
        )
      )
    };
  }

  function createShape(startPoint, endPoint) {
    const widthPx = Math.abs(endPoint.x - startPoint.x);
    const heightPx = Math.abs(endPoint.y - startPoint.y);
    const x = Math.min(startPoint.x, endPoint.x);
    const y = Math.min(startPoint.y, endPoint.y);

    if (tool === "arrow") {
      return {
        id: crypto.randomUUID(),
        tool: "arrow",
        color: clientRef.current.strokeColor || "#2563eb",
        width: clientRef.current.strokeWidth || 4,
        start: startPoint,
        end: endPoint,
        ownerId: clientRef.current.clientId
      };
    }

    return {
      id: crypto.randomUUID(),
      tool,
      color: clientRef.current.strokeColor || "#2563eb",
      width: clientRef.current.strokeWidth || 4,
      x,
      y,
      widthPx,
      heightPx,
      ownerId: clientRef.current.clientId
    };
  }

  function startInteraction(event) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    if (tool === "pan" || event.button === 1 || event.shiftKey) {
      isPanningRef.current = true;
      panOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
        startX: viewportRef.current.x,
        startY: viewportRef.current.y
      };
      return;
    }

    if (!canEdit()) {
      return;
    }

    const point = worldPointFromEvent(event);

    if (tool === "note") {
      addNote({
        id: crypto.randomUUID(),
        x: point.x,
        y: point.y,
        text: "",
        ownerId: clientRef.current.clientId
      });
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      setCurrentObject({
        id: crypto.randomUUID(),
        tool,
        color: clientRef.current.strokeColor || "#2563eb",
        width: clientRef.current.strokeWidth || 4,
        points: [point],
        ownerId: clientRef.current.clientId
      });
      return;
    }

    const shape = createShape(point, point);
    shape.startPoint = point;
    setCurrentObject(shape);
  }

  function continueInteraction(event) {
    const point = worldPointFromEvent(event);
    const now = Date.now();

    if (now - lastCursorSentAtRef.current >= CURSOR_FRAME_MS) {
      send({
        type: "cursor:move",
        cursor: {
          x: point.x,
          y: point.y
        }
      });
      lastCursorSentAtRef.current = now;
    }

    if (noteDragRef.current) {
      const drag = noteDragRef.current;
      const dx =
        (event.clientX - drag.lastClientX) / viewportRef.current.scale;
      const dy =
        (event.clientY - drag.lastClientY) / viewportRef.current.scale;
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      setNotes((prev) =>
        prev.map((note) =>
          note.id === drag.id
            ? {
                ...note,
                x: Math.max(0, Math.min(BOARD_WIDTH - 200, note.x + dx)),
                y: Math.max(0, Math.min(BOARD_HEIGHT - 180, note.y + dy))
              }
            : note
        )
      );
      return;
    }

    if (isPanningRef.current && panOriginRef.current) {
      const origin = panOriginRef.current;
      setViewport((prev) => ({
        ...prev,
        x: origin.startX + (event.clientX - origin.x),
        y: origin.startY + (event.clientY - origin.y)
      }));
      return;
    }

    const activeObject = currentObjectRef.current;
    if (!activeObject) {
      return;
    }

    if (activeObject.tool === "pen" || activeObject.tool === "eraser") {
      setCurrentObject((prev) => ({
        ...prev,
        points: [...prev.points, point]
      }));
      return;
    }

    const startPoint = activeObject.startPoint;
    const shape = createShape(startPoint, point);
    shape.startPoint = startPoint;
    setCurrentObject(shape);
  }

  function stopInteraction() {
    if (noteDragRef.current) {
      const dragged = notesRef.current.find(
        (note) => note.id === noteDragRef.current.id
      );
      if (dragged) {
        send({ type: "note:update", note: dragged });
      }
      noteDragRef.current = null;
      return;
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      panOriginRef.current = null;
      return;
    }

    const activeObject = currentObjectRef.current;
    if (!activeObject) {
      return;
    }

    const finalized = { ...activeObject };
    delete finalized.startPoint;
    setCurrentObject(null);
    addObject(finalized);
  }

  function joinRoom() {
    localStorage.setItem("whiteboard-name", name || "Guest");
    setRoomId(roomInput || "demo-room");
    setObjects([]);
    setNotes([]);
    setComments([]);
    setCursors([]);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSavedAt(null);
    window.history.replaceState(
      {},
      "",
      `?room=${encodeURIComponent(roomInput || "demo-room")}&role=${encodeURIComponent(
        requestedRole
      )}`
    );
    connectToRoom(roomInput || "demo-room", requestedRole);
  }

  async function saveSession() {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(roomIdRef.current)}/save`,
      {
        method: "POST"
      }
    );
    const payload = await response.json();
    setSavedAt(payload.savedAt);
  }

  function exportBoard() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = BOARD_WIDTH;
    exportCanvas.height = BOARD_HEIGHT;
    const exportCtx = exportCanvas.getContext("2d");
    exportCtx.fillStyle = "#fffdf8";
    exportCtx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    exportCtx.drawImage(canvasRef.current, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    notesRef.current.forEach((note) => {
      exportCtx.fillStyle = "#ffd54f";
      exportCtx.fillRect(note.x, note.y, 190, 160);
      exportCtx.fillStyle = "#4a3412";
      exportCtx.font = "16px Plus Jakarta Sans";
      const lines = (note.text || "").split("\n").slice(0, 6);
      lines.forEach((line, index) => {
        exportCtx.fillText(line.slice(0, 24), note.x + 12, note.y + 28 + index * 22);
      });
    });

    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = `${roomIdRef.current}-whiteboard.png`;
    link.click();
  }

  function undo() {
    if (!canEdit() || historyPastRef.current.length === 0) {
      return;
    }
    const nextPast = [...historyPastRef.current];
    const action = nextPast.pop();
    setHistoryPast(nextPast);
    setHistoryFuture((prev) => [...prev, action]);

    if (action.type === "object:add") {
      removeObjectById(action.object.id);
    } else if (action.type === "note:add") {
      removeNoteById(action.note.id);
    }
  }

  function redo() {
    if (!canEdit() || historyFutureRef.current.length === 0) {
      return;
    }
    const nextFuture = [...historyFutureRef.current];
    const action = nextFuture.pop();
    setHistoryFuture(nextFuture);
    setHistoryPast((prev) => [...prev, action]);

    if (action.type === "object:add") {
      setObjects((prev) => [...prev, action.object]);
      send({ type: "object:add", object: action.object });
      return;
    }

    if (action.type === "note:add") {
      setNotes((prev) => [...prev, action.note]);
      send({ type: "note:add", note: action.note });
    }
  }

  function handleWheel(event) {
    event.preventDefault();
    const rect = boardFrameRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const currentViewport = viewportRef.current;
    const nextScale = Math.max(
      0.35,
      Math.min(
        1.8,
        currentViewport.scale + (event.deltaY < 0 ? 0.08 : -0.08)
      )
    );
    const worldX = (mouseX - currentViewport.x) / currentViewport.scale;
    const worldY = (mouseY - currentViewport.y) / currentViewport.scale;

    setViewport({
      scale: nextScale,
      x: mouseX - worldX * nextScale,
      y: mouseY - worldY * nextScale
    });
  }

  function handleCommentSend() {
    const text = commentInput.trim();
    if (!text) {
      return;
    }
    const comment = {
      id: crypto.randomUUID(),
      author: name || "Guest",
      text
    };
    setComments((prev) => [...prev, comment]);
    send({ type: "comment:add", comment });
    setCommentInput("");
  }

  function updateNoteText(noteId, text) {
    setNotes((prev) =>
      prev.map((note) => (note.id === noteId ? { ...note, text } : note))
    );
  }

  function commitNoteText(noteId) {
    const note = notesRef.current.find((item) => item.id === noteId);
    if (note && canEdit()) {
      send({ type: "note:update", note });
    }
  }

  function startNoteDrag(noteId, event) {
    if (!canEdit()) {
      return;
    }
    event.stopPropagation();
    noteDragRef.current = {
      id: noteId,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
  }

  const roleBadge = `Role: ${role}`;
  const connectionBadgeClass = connectionLive ? "badge live" : "badge";
  const viewportStyle = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
  };

  return html`
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <p className="eyebrow">Module 18</p>
          <h1>Collaborative Whiteboard</h1>
          <p className="muted">
            A React-powered collaborative board with live drawing, notes, roles,
            cursors, and session sharing.
          </p>
        </div>

        <div className="panel">
          <h2>Session</h2>
          <label htmlFor="participantName">Your name</label>
          <input
            id="participantName"
            maxLength="24"
            placeholder="Enter your name"
            value=${name}
            onChange=${(event) => setName(event.target.value)}
          />
          <label htmlFor="roleSelect">Role</label>
          <select
            id="roleSelect"
            value=${requestedRole}
            onChange=${(event) => setRequestedRole(event.target.value)}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <label htmlFor="roomId">Session ID</label>
          <div className="row">
            <input
              id="roomId"
              maxLength="40"
              placeholder="e.g. design-lab"
              value=${roomInput}
              onChange=${(event) => setRoomInput(event.target.value)}
            />
            <button onClick=${joinRoom} className="ghost">Join</button>
          </div>
          <div className="action-grid">
            <button
              onClick=${async () => {
                const url = `${window.location.origin}?room=${encodeURIComponent(
                  roomId
                )}&role=viewer`;
                await navigator.clipboard.writeText(url);
              }}
            >
              Copy Link
            </button>
            <button onClick=${saveSession} className="ghost">Save</button>
          </div>
          <p className="meta-line">
            ${savedAt
              ? `Saved: ${new Date(savedAt).toLocaleTimeString()}`
              : "Not saved yet"}
          </p>
        </div>

        <div className="panel">
          <div className="split-head">
            <h2>Participants</h2>
            <span className="pill">${roleBadge}</span>
          </div>
          <div className="stack">
            ${participants.map(
              (participant) => html`
                <div className="participant-pill" key=${participant.id}>
                  <span
                    className="dot"
                    style=${{ background: participant.color }}
                  ></span>
                  <div>
                    <div className="participant-name">${participant.name}</div>
                    <div className="participant-role">
                      ${participant.id === clientRef.current.clientId
                        ? "You"
                        : "Connected"}
                    </div>
                  </div>
                  ${canManage() && participant.id !== clientRef.current.clientId
                    ? html`
                        <select
                          className="participant-role-select"
                          value=${participant.role}
                          onChange=${(event) =>
                            send({
                              type: "role:update",
                              targetId: participant.id,
                              role: event.target.value
                            })}
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      `
                    : html`<span className="participant-role"
                        >${participant.role}</span
                      >`}
                </div>
              `
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Comments</h2>
          <div className="comments">
            ${comments.slice(-10).map(
              (comment) => html`
                <div className="comment-card" key=${comment.id}>
                  <strong>${comment.author}</strong>
                  <span>${comment.text}</span>
                </div>
              `
            )}
          </div>
          <div className="row">
            <input
              maxLength="160"
              placeholder="Share an idea..."
              value=${commentInput}
              onChange=${(event) => setCommentInput(event.target.value)}
            />
            <button onClick=${handleCommentSend}>Send</button>
          </div>
        </div>
      </aside>

      <main className="board-stage">
        <div className="topbar">
          <div>
            <p className="eyebrow">Live session</p>
            <h2>${`Session: ${roomId}`}</h2>
          </div>
          <div className="status-group">
            <div className="pill subtle">${TOOL_SHORTCUTS}</div>
            <div className=${connectionBadgeClass}>
              ${connectionLive ? "Live" : "Offline"}
            </div>
          </div>
        </div>

        <section
          className="board-frame"
          ref=${boardFrameRef}
          onPointerDown=${startInteraction}
          onPointerMove=${continueInteraction}
          onPointerUp=${stopInteraction}
          onPointerLeave=${stopInteraction}
          onWheel=${handleWheel}
        >
          <div className="floating-toolbar">
            <div className="tool-row">
              ${[
                ["pen", "Pen"],
                ["eraser", "Eraser"],
                ["rectangle", "Rect"],
                ["ellipse", "Circle"],
                ["arrow", "Arrow"],
                ["note", "Note"],
                ["pan", "Pan"]
              ].map(
                ([toolKey, label]) => html`
                  <button
                    key=${toolKey}
                    className=${tool === toolKey ? "tool active" : "tool"}
                    disabled=${!canEdit() && toolKey !== "pan"}
                    onClick=${() => setTool(toolKey)}
                  >
                    ${label}
                  </button>
                `
              )}
            </div>
            <div className="toolbar-controls">
              <input
                id="strokeColor"
                type="color"
                defaultValue="#2563eb"
                disabled=${!canEdit()}
                onChange=${(event) => {
                  clientRef.current.strokeColor = event.target.value;
                }}
              />
              <input
                id="strokeWidth"
                type="range"
                min="2"
                max="18"
                defaultValue="4"
                disabled=${!canEdit()}
                onChange=${(event) => {
                  clientRef.current.strokeWidth = Number(event.target.value);
                }}
              />
              <button
                className="ghost compact"
                disabled=${!canEdit() || historyPast.length === 0}
                onClick=${undo}
              >
                Undo
              </button>
              <button
                className="ghost compact"
                disabled=${!canEdit() || historyFuture.length === 0}
                onClick=${redo}
              >
                Redo
              </button>
              <button
                className="danger compact"
                disabled=${!canManage()}
                onClick=${() => {
                  if (!canManage()) {
                    return;
                  }
                  setObjects([]);
                  setNotes([]);
                  setComments([]);
                  setHistoryPast([]);
                  setHistoryFuture([]);
                  send({ type: "board:clear" });
                }}
              >
                Clear
              </button>
              <button className="ghost compact" onClick=${exportBoard}>
                PNG
              </button>
            </div>
          </div>

          <div className="viewport-layer" style=${viewportStyle}>
            <canvas id="board" ref=${canvasRef}></canvas>

            <div className="notes-layer">
              ${notes.map(
                (note) => html`
                  <div
                    key=${note.id}
                    className="sticky-note"
                    style=${{ left: `${note.x}px`, top: `${note.y}px` }}
                    onPointerDown=${(event) => startNoteDrag(note.id, event)}
                  >
                    <textarea
                      maxLength="180"
                      placeholder="Add a note..."
                      disabled=${!canEdit()}
                      value=${note.text || ""}
                      onChange=${(event) =>
                        updateNoteText(note.id, event.target.value)}
                      onBlur=${() => commitNoteText(note.id)}
                    ></textarea>
                  </div>
                `
              )}
            </div>

            <div className="cursor-layer">
              ${cursors
                .filter(
                  (cursor) => cursor.clientId !== clientRef.current.clientId
                )
                .map(
                  (cursor) => html`
                    <div
                      key=${cursor.clientId}
                      className="cursor-chip"
                      style=${{ left: `${cursor.x}px`, top: `${cursor.y}px` }}
                    >
                      <div
                        className="cursor-dot"
                        style=${{ background: cursor.color }}
                      ></div>
                      <div
                        className="cursor-label"
                        style=${{ background: cursor.color }}
                      >
                        ${cursor.name}
                      </div>
                    </div>
                  `
                )}
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function drawArrow(ctx, object) {
  const { start, end, color, width } = object;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(12, width * 3);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawObject(ctx, object) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (object.tool === "pen" || object.tool === "eraser") {
    if (!object.points || object.points.length === 0) {
      ctx.restore();
      return;
    }

    ctx.strokeStyle = object.tool === "eraser" ? "#fffdf8" : object.color;
    ctx.lineWidth = object.width;
    ctx.beginPath();
    ctx.moveTo(object.points[0].x, object.points[0].y);
    object.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.strokeStyle = object.color;
  ctx.lineWidth = object.width;

  if (object.tool === "rectangle") {
    ctx.strokeRect(object.x, object.y, object.widthPx, object.heightPx);
  } else if (object.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      object.x + object.widthPx / 2,
      object.y + object.heightPx / 2,
      Math.abs(object.widthPx / 2),
      Math.abs(object.heightPx / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else if (object.tool === "arrow") {
    ctx.restore();
    drawArrow(ctx, object);
    return;
  }

  ctx.restore();
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(html`<${App} />`);
