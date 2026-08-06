'use client';

import { useEffect, useMemo, useState } from 'react';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const STORAGE_KEY = 'mi-calendario-events-v1';

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadLocalEvents() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => dateKey(today), [today]);
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState('Cargando…');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  useEffect(() => {
    const local = loadLocalEvents();
    setEvents(local);

    async function loadCloudEvents() {
      if (!supabaseUrl || !supabaseKey) {
        setStatus('Guardado en este teléfono');
        return;
      }

      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/events?select=*&order=date.asc`, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          cache: 'no-store',
        });

        if (!response.ok) throw new Error('Supabase no disponible');
        const data = await response.json();
        const cloudEvents = data.map((item) => ({
          id: item.id,
          title: item.title,
          date: String(item.date).slice(0, 10),
          time: item.date && String(item.date).includes('T') ? String(item.date).slice(11, 16) : '',
          cloud: true,
        }));

        setEvents(cloudEvents);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudEvents));
        setStatus('Conectado a Supabase');
      } catch {
        setStatus('Guardado en este teléfono');
      }
    }

    loadCloudEvents();
  }, [supabaseUrl, supabaseKey]);

  const cells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result = [];

    for (let index = 0; index < firstDay; index += 1) result.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) result.push(new Date(year, month, day));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [currentMonth]);

  const selectedEvents = events
    .filter((event) => event.date === selectedDate)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  function saveLocal(nextEvents) {
    setEvents(nextEvents);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEvents));
  }

  async function addEvent(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const localEvent = {
      id: newId(),
      title: cleanTitle,
      date: selectedDate,
      time,
      cloud: false,
    };

    const nextEvents = [...events, localEvent];
    saveLocal(nextEvents);
    setTitle('');
    setTime('');
    setShowForm(false);

    if (!supabaseUrl || !supabaseKey) return;

    try {
      const timestamp = `${selectedDate}T${time || '12:00'}:00`;
      const response = await fetch(`${supabaseUrl}/rest/v1/events`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ title: cleanTitle, date: timestamp }),
      });

      if (!response.ok) throw new Error('No se pudo sincronizar');
      const [saved] = await response.json();
      const updated = nextEvents.map((item) => item.id === localEvent.id
        ? { ...item, id: saved.id, cloud: true }
        : item);
      saveLocal(updated);
      setStatus('Conectado a Supabase');
    } catch {
      setStatus('Guardado en este teléfono');
    }
  }

  async function deleteEvent(eventToDelete) {
    const nextEvents = events.filter((event) => event.id !== eventToDelete.id);
    saveLocal(nextEvents);

    if (!eventToDelete.cloud || !supabaseUrl || !supabaseKey) return;

    try {
      await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${eventToDelete.id}`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
    } catch {
      setStatus('Eliminado en este teléfono');
    }
  }

  function selectDay(day) {
    if (!day) return;
    setSelectedDate(dateKey(day));
  }

  function goToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  }

  const selectedLabel = parseDate(selectedDate).toLocaleDateString('es-US', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <main className="page">
      <section className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">Organización personal</p>
            <h1>Mi Calendario</h1>
          </div>
          <button className="primary" onClick={() => setShowForm(true)}>＋ Evento</button>
        </header>

        <div className="status"><span />{status}</div>

        <div className="toolbar">
          <button className="nav" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>‹</button>
          <div>
            <h2>{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h2>
            <button className="today" onClick={goToday}>Ir a hoy</button>
          </div>
          <button className="nav" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>›</button>
        </div>

        <div className="weekdays">
          {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
        </div>

        <div className="calendar">
          {cells.map((day, index) => {
            if (!day) return <div className="empty" key={`empty-${index}`} />;
            const key = dateKey(day);
            const isSelected = key === selectedDate;
            const isToday = key === todayKey;
            const count = events.filter((event) => event.date === key).length;

            return (
              <button
                key={key}
                className={`day ${isSelected ? 'selected' : ''}`}
                onClick={() => selectDay(day)}
              >
                <span className={isToday ? 'number current' : 'number'}>{day.getDate()}</span>
                {count > 0 && <span className="eventCount">{count}</span>}
              </button>
            );
          })}
        </div>

        <section className="agenda">
          <div className="agendaHeader">
            <div>
              <p className="eyebrow">Agenda</p>
              <h3>{selectedLabel}</h3>
            </div>
            <button className="round" onClick={() => setShowForm(true)}>＋</button>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="emptyState">
              <div>✓</div>
              <strong>Día disponible</strong>
              <p>No tienes eventos registrados.</p>
            </div>
          ) : (
            <div className="eventList">
              {selectedEvents.map((item) => (
                <article className="event" key={item.id}>
                  <div className="eventBar" />
                  <div className="eventText">
                    <small>{item.time || 'Todo el día'}</small>
                    <strong>{item.title}</strong>
                  </div>
                  <button className="delete" onClick={() => deleteEvent(item)}>×</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {showForm && (
        <div className="backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onSubmit={addEvent} onClick={(event) => event.stopPropagation()}>
            <h3>Nuevo evento</h3>
            <p>{selectedLabel}</p>
            <label>Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Cita médica" autoFocus required />
            </label>
            <label>Hora
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f3f5fb; color: #202334; }
        button, input { font: inherit; }
        button { cursor: pointer; }
        .page { min-height: 100vh; padding: max(18px, env(safe-area-inset-top)) 14px max(24px, env(safe-area-inset-bottom)); font-family: Arial, sans-serif; }
        .app { width: min(760px, 100%); margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 18px 55px rgba(28, 32, 68, .13); }
        .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 22px 20px 14px; }
        h1, h2, h3, p { margin-top: 0; }
        h1 { margin-bottom: 0; font-size: 28px; letter-spacing: -.8px; }
        h2 { margin: 0 0 4px; font-size: 20px; }
        h3 { margin: 0; text-transform: capitalize; }
        .eyebrow { margin-bottom: 4px; color: #7a7d90; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
        .primary { border: 0; border-radius: 12px; background: #5657dc; color: white; padding: 11px 15px; font-weight: 800; }
        .status { display: flex; align-items: center; gap: 8px; padding: 0 20px 15px; color: #73768a; font-size: 12px; }
        .status span { width: 8px; height: 8px; border-radius: 50%; background: #18a97b; box-shadow: 0 0 0 4px rgba(24,169,123,.12); }
        .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px; border-top: 1px solid #ececf3; border-bottom: 1px solid #ececf3; text-align: center; }
        .nav, .round { border: 0; background: #f4f4fa; color: #55586d; border-radius: 12px; width: 42px; height: 42px; font-size: 28px; }
        .today { border: 0; background: transparent; color: #5657dc; font-size: 12px; font-weight: 800; }
        .weekdays, .calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
        .weekdays { background: #fafafe; color: #7a7d90; border-bottom: 1px solid #ececf3; }
        .weekdays div { padding: 12px 2px; text-align: center; font-size: 11px; font-weight: 800; }
        .day, .empty { position: relative; min-height: 72px; border: 0; border-right: 1px solid #f0f0f5; border-bottom: 1px solid #f0f0f5; background: white; padding: 8px 3px; display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .day.selected { background: #f0f0ff; }
        .number { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 50%; font-size: 13px; font-weight: 700; }
        .number.current { background: #5657dc; color: white; }
        .eventCount { min-width: 20px; border-radius: 99px; background: #e6e7ff; color: #5657dc; padding: 2px 6px; font-size: 10px; font-weight: 800; }
        .agenda { padding: 20px; background: #fafafe; }
        .agendaHeader { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 15px; border-bottom: 1px solid #e7e7ef; }
        .emptyState { padding: 30px 10px 15px; text-align: center; color: #74778a; }
        .emptyState div { width: 46px; height: 46px; margin: 0 auto 12px; display: grid; place-items: center; border-radius: 15px; background: #e5f7f0; color: #12966d; font-size: 20px; font-weight: 900; }
        .emptyState strong { color: #292c3b; }
        .emptyState p { margin: 7px 0 0; font-size: 13px; }
        .eventList { padding-top: 14px; }
        .event { display: grid; grid-template-columns: 4px minmax(0,1fr) 30px; gap: 12px; padding: 13px; margin-bottom: 9px; border: 1px solid #e8e8ef; border-radius: 14px; background: white; }
        .eventBar { border-radius: 99px; background: #5657dc; }
        .eventText { display: grid; gap: 4px; }
        .eventText small { color: #7b7e91; font-weight: 700; }
        .delete { border: 0; border-radius: 9px; background: transparent; color: #b1b2be; font-size: 22px; }
        .backdrop { position: fixed; inset: 0; z-index: 20; padding: 18px; display: grid; place-items: center; background: rgba(20,22,36,.55); backdrop-filter: blur(8px); }
        .modal { width: min(440px,100%); padding: 22px; border-radius: 20px; background: white; box-shadow: 0 25px 70px rgba(0,0,0,.25); }
        .modal > p { color: #74778a; text-transform: capitalize; }
        label { display: grid; gap: 7px; margin-top: 14px; color: #515466; font-size: 13px; font-weight: 800; }
        input { width: 100%; height: 46px; padding: 0 13px; border: 1px solid #dfe0e8; border-radius: 12px; outline: none; }
        input:focus { border-color: #6768e4; box-shadow: 0 0 0 4px rgba(86,87,220,.1); }
        .actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 20px; }
        .secondary { border: 1px solid #e0e1e8; border-radius: 12px; background: white; padding: 10px 14px; font-weight: 800; }
        @media (max-width: 480px) {
          .page { padding-left: 0; padding-right: 0; padding-top: 0; }
          .app { min-height: 100vh; border-radius: 0; }
          .topbar { padding-top: max(20px, env(safe-area-inset-top)); }
          .day, .empty { min-height: 59px; }
          .topbar h1 { font-size: 24px; }
        }
      `}</style>
    </main>
  );
}
