"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "mi-calendario-eventos-v4";
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CATEGORIAS = [
  { id: "trabajo", nombre: "Trabajo", color: "#3b82f6", suave: "#dbeafe", texto: "#1d4ed8" },
  { id: "personal", nombre: "Personal", color: "#22c55e", suave: "#dcfce7", texto: "#15803d" },
  { id: "salud", nombre: "Salud", color: "#ef4444", suave: "#fee2e2", texto: "#b91c1c" },
  { id: "familia", nombre: "Familia", color: "#eab308", suave: "#fef9c3", texto: "#a16207" },
  { id: "finanzas", nombre: "Finanzas", color: "#a855f7", suave: "#f3e8ff", texto: "#7e22ce" },
  { id: "educacion", nombre: "Educación", color: "#f97316", suave: "#ffedd5", texto: "#c2410c" },
  { id: "ocio", nombre: "Ocio", color: "#ec4899", suave: "#fce7f3", texto: "#be185d" },
];

const pad = (n) => String(n).padStart(2, "0");
const fechaKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const desdeKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const idNuevo = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const categoriaPorId = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[1];

function leerEventos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

export default function Home() {
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12));
  const [seleccionada, setSeleccionada] = useState(fechaKey(hoy));
  const [eventos, setEventos] = useState([]);
  const [listo, setListo] = useState(false);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");
  const [categoria, setCategoria] = useState("personal");
  const [notas, setNotas] = useState("");
  const [audio, setAudio] = useState("");
  const [grabando, setGrabando] = useState(false);
  const [errorAudio, setErrorAudio] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    setEventos(leerEventos());
    setListo(true);
  }, []);

  useEffect(() => {
    if (!listo) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(eventos));
    } catch {
      alert("El teléfono no tiene espacio suficiente. Prueba borrando audios antiguos.");
    }
  }, [eventos, listo]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const celdas = useMemo(() => {
    const y = mes.getFullYear();
    const m = mes.getMonth();
    const primero = new Date(y, m, 1, 12);
    const total = new Date(y, m + 1, 0, 12).getDate();
    const resultado = Array(primero.getDay()).fill(null);
    for (let d = 1; d <= total; d += 1) resultado.push(new Date(y, m, d, 12));
    while (resultado.length % 7) resultado.push(null);
    return resultado;
  }, [mes]);

  const eventosDia = useMemo(
    () => eventos.filter((e) => e.fecha === seleccionada).sort((a, b) => (a.hora || "").localeCompare(b.hora || "")),
    [eventos, seleccionada]
  );

  const etiquetaFecha = useMemo(() => {
    const texto = desdeKey(seleccionada).toLocaleDateString("es-US", { weekday: "long", day: "numeric", month: "long" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }, [seleccionada]);

  function limpiarFormulario() {
    setTitulo("");
    setHora("");
    setCategoria("personal");
    setNotas("");
    setAudio("");
    setErrorAudio("");
  }

  function abrirNuevo() {
    setEditando(null);
    limpiarFormulario();
    setModal(true);
  }

  function abrirEditar(evento) {
    setEditando(evento);
    setTitulo(evento.titulo || "");
    setHora(evento.hora || "");
    setCategoria(evento.categoria || "personal");
    setNotas(evento.notas || "");
    setAudio(evento.audio || "");
    setErrorAudio("");
    setModal(true);
  }

  function cerrarModal() {
    if (grabando) detenerGrabacion();
    setModal(false);
    setEditando(null);
  }

  function guardar(e) {
    e.preventDefault();
    const limpio = titulo.trim();
    if (!limpio) return;
    const datos = { titulo: limpio, hora, categoria, notas: notas.trim(), audio };
    setEventos((actuales) => editando
      ? actuales.map((item) => item.id === editando.id ? { ...item, ...datos } : item)
      : [...actuales, { id: idNuevo(), fecha: seleccionada, creado: new Date().toISOString(), ...datos }]
    );
    setModal(false);
    setEditando(null);
  }

  function eliminar(id) {
    if (confirm("¿Quieres eliminar este evento?")) {
      setEventos((actuales) => actuales.filter((item) => item.id !== id));
    }
  }

  async function iniciarGrabacion() {
    setErrorAudio("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorAudio("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          setAudio(await blobADataUrl(blob));
        } catch {
          setErrorAudio("No se pudo guardar la grabación.");
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setGrabando(false);
      };
      recorder.start();
      setGrabando(true);
      timerRef.current = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 45000);
    } catch {
      setErrorAudio("Debes permitir el acceso al micrófono.");
    }
  }

  function detenerGrabacion() {
    clearTimeout(timerRef.current);
    if (recorderRef.current?.state !== "inactive") recorderRef.current.stop();
    else setGrabando(false);
  }

  return (
    <main className="pagina">
      <section className="app">
        <header className="cabecera">
          <div>
            <p className="eyebrow">ORGANIZACIÓN PERSONAL</p>
            <h1>Mi Calendario</h1>
            <p className="estado"><span />Guardado en este teléfono</p>
          </div>
          <button className="principal" onClick={abrirNuevo}>＋ Evento</button>
        </header>

        <div className="contenido">
          <div className="navegacion">
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1, 12))}>‹</button>
            <div>
              <h2>{MESES[mes.getMonth()]} {mes.getFullYear()}</h2>
              <button className="hoy" onClick={() => { setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12)); setSeleccionada(fechaKey(hoy)); }}>Ir a hoy</button>
            </div>
            <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1, 12))}>›</button>
          </div>

          <div className="semana">{DIAS.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="calendario">
            {celdas.map((dia, i) => {
              if (!dia) return <span className="vacia" key={`v-${i}`} />;
              const key = fechaKey(dia);
              const seleccionado = key === seleccionada;
              const esHoy = key === fechaKey(hoy);
              const delDia = eventos.filter((e) => e.fecha === key);
              return (
                <button className={`dia ${seleccionado ? "seleccionado" : ""}`} key={key} onClick={() => setSeleccionada(key)}>
                  <span className={`numero ${esHoy ? "actual" : ""}`}>{dia.getDate()}</span>
                  {!!delDia.length && <span className="puntos">{delDia.slice(0, 3).map((e) => <i key={e.id} style={{ background: seleccionado ? "white" : categoriaPorId(e.categoria).color }} />)}</span>}
                </button>
              );
            })}
          </div>

          <section className="agenda">
            <div className="agendaTitulo">
              <div><p className="eyebrow">AGENDA</p><h3>{etiquetaFecha}</h3></div>
              <button onClick={abrirNuevo}>＋</button>
            </div>
            {!eventosDia.length ? (
              <div className="sinEventos"><b>✓</b><strong>Día disponible</strong><p>No hay eventos para este día.</p></div>
            ) : (
              <div className="lista">
                {eventosDia.map((evento) => {
                  const cat = categoriaPorId(evento.categoria);
                  return (
                    <article className="evento" key={evento.id}>
                      <span className="barra" style={{ background: cat.color }} />
                      <div className="eventoInfo">
                        <div className="eventoMeta"><span style={{ background: cat.suave, color: cat.texto }}>{cat.nombre.toUpperCase()}</span>{evento.hora && <time>{evento.hora}</time>}</div>
                        <h4>{evento.titulo}</h4>
                        {evento.notas && <p className="notas">💬 {evento.notas}</p>}
                        {evento.audio && <audio controls preload="metadata" src={evento.audio} />}
                      </div>
                      <div className="acciones"><button onClick={() => abrirEditar(evento)}>✎</button><button className="borrar" onClick={() => eliminar(evento.id)}>×</button></div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>

      {modal && (
        <div className="fondo" onClick={cerrarModal}>
          <form className="modal" onSubmit={guardar} onClick={(e) => e.stopPropagation()}>
            <div className="modalTitulo"><div><p className="eyebrow">{editando ? "EDITAR EVENTO" : "NUEVO EVENTO"}</p><h3>{etiquetaFecha}</h3></div><button type="button" onClick={cerrarModal}>×</button></div>
            <label><span>¿QUÉ TIENES PLANEADO?</span><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Cena, reunión, cita médica..." autoFocus required /></label>
            <label><span>HORA</span><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
            <div><span className="campo">🏷 CATEGORÍA</span><div className="categorias">{CATEGORIAS.map((cat) => <button type="button" key={cat.id} onClick={() => setCategoria(cat.id)} style={{ background: categoria === cat.id ? cat.color : cat.suave, color: categoria === cat.id ? "white" : cat.texto }}>{cat.nombre}</button>)}</div></div>
            <label><span>NOTAS O MENSAJES</span><textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Escribe los detalles aquí..." /></label>
            <div className="audioBox"><div><strong>Nota de voz</strong><p>{grabando ? "Grabando…" : audio ? "Grabación lista" : "Máximo 45 segundos"}</p></div><button type="button" className={grabando ? "grabando" : ""} onClick={grabando ? detenerGrabacion : iniciarGrabacion}>{grabando ? "■" : "🎙"}</button></div>
            {errorAudio && <p className="error">{errorAudio}</p>}
            {audio && <div className="audioPrevio"><audio controls src={audio} /><button type="button" onClick={() => setAudio("")}>Quitar audio</button></div>}
            <div className="modalAcciones"><button type="button" className="secundario" onClick={cerrarModal}>Cancelar</button><button className="principal" disabled={!titulo.trim()}>{editando ? "Guardar cambios" : "Guardar evento"}</button></div>
          </form>
        </div>
      )}

      <style jsx global>{`
        *{box-sizing:border-box}html,body{margin:0;background:#f7f7fb;color:#1e293b}button,input,textarea{font:inherit}button{cursor:pointer}.pagina{min-height:100vh;padding:max(16px,env(safe-area-inset-top)) 14px max(26px,env(safe-area-inset-bottom));font-family:Arial,sans-serif;background:radial-gradient(circle at top left,rgba(79,70,229,.08),transparent 32%),#f7f7fb}.app{width:min(760px,100%);margin:auto;background:white;border-radius:28px;overflow:hidden;box-shadow:0 20px 60px rgba(30,41,59,.12)}.cabecera{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:26px 22px 20px}h1,h2,h3,h4,p{margin-top:0}h1{margin-bottom:7px;font-size:clamp(28px,7vw,36px);letter-spacing:-1px;color:#0f172a}.eyebrow{margin-bottom:5px;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:1.2px}.estado{display:flex;align-items:center;gap:8px;margin:0;color:#64748b;font-size:13px}.estado span{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.14)}.principal{border:0;border-radius:16px;padding:13px 17px;background:#4f46e5;color:white;font-weight:800;box-shadow:0 10px 22px rgba(79,70,229,.2)}.principal:disabled{opacity:.5;box-shadow:none}.contenido{padding:0 20px 22px}.navegacion{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:12px;border:1px solid #eef0f5;border-radius:19px;box-shadow:0 7px 22px rgba(30,41,59,.06);text-align:center}.navegacion>button,.agendaTitulo>button{width:43px;height:43px;border:0;border-radius:13px;background:#f1f5f9;color:#475569;font-size:28px}.navegacion h2{margin:0 0 4px;font-size:20px}.hoy{border:0;background:transparent;color:#4f46e5;font-size:12px;font-weight:800}.semana,.calendario{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.semana span{padding:9px 0;text-align:center;color:#94a3b8;font-size:11px;font-weight:800}.dia,.vacia{height:50px;border:0;border-radius:13px;background:transparent}.dia{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#334155;font-weight:700}.dia:hover{background:#f1f5f9}.dia.seleccionado{background:#4f46e5;color:white;box-shadow:0 7px 16px rgba(79,70,229,.23)}.numero{width:29px;height:29px;display:grid;place-items:center;border-radius:50%}.dia:not(.seleccionado) .numero.actual{background:#eef2ff;color:#4f46e5}.dia.seleccionado .numero.actual{background:rgba(255,255,255,.14)}.puntos{position:absolute;bottom:4px;display:flex;gap:3px}.puntos i{width:5px;height:5px;border-radius:50%}.agenda{margin-top:27px}.agendaTitulo{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid #e8ebf1}.agendaTitulo h3{margin:0;font-size:20px}.sinEventos{padding:34px 10px 15px;text-align:center;color:#94a3b8}.sinEventos b{width:50px;height:50px;margin:0 auto 12px;display:grid;place-items:center;border-radius:16px;background:#dcfce7;color:#16a34a;font-size:21px}.sinEventos strong{display:block;color:#475569}.sinEventos p{margin:7px 0 0}.lista{padding-top:14px}.evento{position:relative;display:grid;grid-template-columns:7px minmax(0,1fr) auto;gap:13px;margin-bottom:12px;padding:16px;border:1px solid #edf0f5;border-radius:21px;overflow:hidden;box-shadow:0 8px 25px rgba(30,41,59,.06)}.barra{position:absolute;inset:0 auto 0 0;width:7px}.eventoInfo{grid-column:2;min-width:0}.eventoMeta{display:flex;justify-content:space-between;gap:8px;align-items:center}.eventoMeta span{padding:5px 8px;border-radius:7px;font-size:10px;font-weight:900}.eventoMeta time{color:#64748b;font-size:12px;font-weight:800}.evento h4{margin:8px 0 0;font-size:18px}.notas{margin:9px 0 0;color:#64748b;font-size:14px;white-space:pre-wrap}.evento audio{width:100%;height:40px;margin-top:11px}.acciones{display:flex;gap:4px;align-items:flex-start}.acciones button{width:32px;height:32px;border:0;border-radius:10px;background:#f1f5f9;color:#475569;font-size:18px}.acciones .borrar{color:#dc2626}.fondo{position:fixed;z-index:100;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(15,23,42,.46);backdrop-filter:blur(7px)}.modal{width:min(520px,100%);max-height:calc(100vh - 24px);overflow:auto;padding:23px;border-radius:28px;background:white;box-shadow:0 24px 70px rgba(15,23,42,.3)}.modalTitulo{display:flex;justify-content:space-between;gap:12px;margin-bottom:22px}.modalTitulo h3{margin:0}.modalTitulo>button{width:39px;height:39px;border:0;border-radius:50%;background:#f1f5f9;color:#64748b;font-size:23px}.modal label{display:block;margin-bottom:18px}.modal label>span,.campo{display:block;margin-bottom:8px;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:1px}.modal input,.modal textarea{width:100%;border:1px solid #e2e8f0;border-radius:15px;outline:none;background:#f8fafc;color:#1e293b}.modal input{min-height:48px;padding:0 14px}.modal textarea{min-height:105px;padding:13px 14px;resize:vertical}.modal input:focus,.modal textarea:focus{border-color:#a5b4fc;box-shadow:0 0 0 4px rgba(79,70,229,.09)}.categorias{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}.categorias button{border:0;border-radius:12px;padding:8px 11px;font-size:13px;font-weight:800}.audioBox{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid #e2e8f0;border-radius:17px;background:#f8fafc}.audioBox strong{font-size:14px}.audioBox p{margin:5px 0 0;color:#94a3b8;font-size:12px}.audioBox button{width:50px;height:50px;border:1px solid #e2e8f0;border-radius:50%;background:white;font-size:21px}.audioBox button.grabando{background:#ef4444;color:white;animation:pulso 1s infinite}.error{margin:9px 0 0;color:#dc2626;font-size:13px}.audioPrevio{margin-top:12px;padding:12px;border-radius:15px;background:#f8fafc}.audioPrevio audio{width:100%}.audioPrevio button{margin-top:8px;border:0;background:transparent;color:#dc2626;font-size:12px;font-weight:800}.modalAcciones{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.secundario{border:0;border-radius:15px;padding:13px 16px;background:#e2e8f0;color:#475569;font-weight:800}@keyframes pulso{50%{transform:scale(1.06);box-shadow:0 0 0 8px rgba(239,68,68,.15)}}@media(min-width:640px){.fondo{align-items:center}.dia,.vacia{height:62px}}@media(max-width:430px){.pagina{padding:0}.app{border-radius:0;box-shadow:none}.cabecera{padding:max(23px,env(safe-area-inset-top)) 17px 19px}.contenido{padding-left:13px;padding-right:13px}.cabecera .principal{padding:12px 13px}.semana,.calendario{gap:3px}.dia,.vacia{height:47px;border-radius:11px}.evento{padding:14px 11px 14px 14px}.acciones{flex-direction:column}.modal{padding-bottom:max(23px,env(safe-area-inset-bottom))}}
      `}</style>
    </main>
  );
}
