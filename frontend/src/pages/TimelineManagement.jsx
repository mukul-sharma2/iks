import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Landmark, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import api, { getApiError } from '../services/api.js';

const emptyPeriod = {
  name: '',
  era: '',
  date_range: '',
  description: '',
  subperiods: '',
  order: '0',
  is_active: true,
};

const emptyEntry = {
  period_id: '',
  subperiod: '',
  entry_type: 'civilization',
  title: '',
  date_range: '',
  region: '',
  capital: '',
  leaders: '',
  overview: '',
  achievements: '',
  legacy: '',
  subperiods: [],
  order: '0',
  is_published: true,
};

const entryTypes = [
  ['civilization', 'Civilization'],
  ['kingdom', 'Kingdom or empire'],
  ['event', 'Historical event'],
  ['movement', 'Movement or tradition'],
  ['institution', 'Institution'],
  ['other', 'Other'],
];

export default function TimelineManagement({ refreshToken = 0 }) {
  const [periods, setPeriods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('periods');
  const [periodForm, setPeriodForm] = useState(emptyPeriod);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/timeline');
      setPeriods(data.periods || []);
      setEntries(data.entries || []);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTimeline(); }, [loadTimeline, refreshToken]);

  const savePeriod = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...periodForm,
      order: Number(periodForm.order),
      subperiods: periodForm.subperiods.split('\n').map((item) => item.trim()).filter(Boolean),
    };
    try {
      if (editingPeriod) {
        await api.put(`/admin/timeline/periods/${editingPeriod.id}`, payload);
        setNotice('Historical period updated.');
      } else {
        await api.post('/admin/timeline/periods', payload);
        setNotice('Historical period created.');
      }
      setPeriodForm(emptyPeriod);
      setEditingPeriod(null);
      await loadTimeline();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const saveEntry = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = { ...entryForm, order: Number(entryForm.order) };
    try {
      if (editingEntry) {
        await api.put(`/admin/timeline/entries/${editingEntry.id}`, payload);
        setNotice('Historical profile updated.');
      } else {
        await api.post('/admin/timeline/entries', payload);
        setNotice('Historical profile created.');
      }
      setEntryForm(emptyEntry);
      setEditingEntry(null);
      await loadTimeline();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const updateSpecificSubperiod = (index, update) => setEntryForm({
    ...entryForm,
    subperiods: entryForm.subperiods.map((subperiod, subperiodIndex) => (
      subperiodIndex === index ? { ...subperiod, ...update } : subperiod
    )),
  });

  const archivePeriod = async (period) => {
    const action = period.is_active ? 'Archive' : 'Restore';
    if (period.is_active && !window.confirm(`Archive “${period.name}”? Its history will be hidden publicly but retained.`)) return;
    setError('');
    setNotice('');
    try {
      if (period.is_active) {
        await api.delete(`/admin/timeline/periods/${period.id}`);
      } else {
        await api.patch(`/admin/timeline/periods/${period.id}/restore`);
      }
      setNotice(`Historical period ${action.toLowerCase()}d.`);
      await loadTimeline();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete “${entry.title}”?`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/admin/timeline/entries/${entry.id}`);
      setNotice('Historical profile deleted.');
      await loadTimeline();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const startEditingPeriod = (period) => {
    setEditingPeriod(period);
    setPeriodForm({
      name: period.name,
      era: period.era || '',
      date_range: period.date_range || '',
      description: period.description || '',
      subperiods: (period.subperiods || []).join('\n'),
      order: String(period.order ?? 0),
      is_active: period.is_active !== false,
    });
    setTab('periods');
  };

  const startEditingEntry = (entry) => {
    setEditingEntry(entry);
    setEntryForm({
      period_id: entry.period_id,
      subperiod: entry.subperiod || '',
      entry_type: entry.entry_type,
      title: entry.title,
      date_range: entry.date_range,
      region: entry.region || '',
      capital: entry.capital || '',
      leaders: entry.leaders || '',
      overview: entry.overview,
      achievements: entry.achievements || '',
      legacy: entry.legacy || '',
      subperiods: (entry.subperiods || []).map((subperiod) => ({ ...subperiod })),
      order: String(entry.order ?? 0),
      is_published: entry.is_published !== false,
    });
    setTab('entries');
  };

  const cancelEdit = () => {
    setEditingPeriod(null);
    setEditingEntry(null);
    setPeriodForm(emptyPeriod);
    setEntryForm(emptyEntry);
  };

  if (loading) {
    return <div className="admin-loading"><RefreshCw className="spin" size={18} /> Gathering the historical records…</div>;
  }

  return <div className="timeline-admin">
    {error && <div className="admin-alert admin-alert-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
    {notice && <div className="admin-alert admin-alert-success" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    <div className="timeline-admin-tabs" role="tablist" aria-label="Timeline content">
      <button type="button" className={tab === 'periods' ? 'active' : ''} role="tab" aria-selected={tab === 'periods'} onClick={() => setTab('periods')}><BookOpen size={15} /> Periods & subperiods</button>
      <button type="button" className={tab === 'entries' ? 'active' : ''} role="tab" aria-selected={tab === 'entries'} onClick={() => setTab('entries')}><Landmark size={15} /> Kingdoms & history</button>
      <button type="button" className="timeline-admin-refresh" onClick={loadTimeline} aria-label="Refresh timeline"><RefreshCw size={14} /> Refresh</button>
    </div>

    {tab === 'periods' ? <div className="admin-management-grid">
      <section className="admin-panel admin-form-panel">
        <div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editingPeriod ? 'EDIT THE CHRONICLE' : 'ADD TO THE CHRONICLE'}</span><h2>{editingPeriod ? 'Edit period' : 'New period'}</h2></div></div>
        <form className="admin-form" onSubmit={savePeriod}>
          <label>Period name<input required maxLength={100} value={periodForm.name} onChange={(event) => setPeriodForm({ ...periodForm, name: event.target.value })} placeholder="e.g. Ancient India" /></label>
          <div className="timeline-form-row">
            <label>Era label<input maxLength={80} value={periodForm.era} onChange={(event) => setPeriodForm({ ...periodForm, era: event.target.value })} placeholder="e.g. EARLY HISTORIC" /></label>
            <label>Date range<input maxLength={100} value={periodForm.date_range} onChange={(event) => setPeriodForm({ ...periodForm, date_range: event.target.value })} placeholder="e.g. c. 2600–550 BCE" /></label>
          </div>
          <label>Overview<textarea required maxLength={2000} rows={3} value={periodForm.description} onChange={(event) => setPeriodForm({ ...periodForm, description: event.target.value })} placeholder="A short introduction to this historical period" /></label>
          <label>Subperiods <small>Enter one per line; they can be referenced by historical profiles.</small><textarea maxLength={5000} rows={6} value={periodForm.subperiods} onChange={(event) => setPeriodForm({ ...periodForm, subperiods: event.target.value })} placeholder={'Indus Valley Civilisation\nVedic Period\nMaurya Empire'} /></label>
          <div className="timeline-form-row">
            <label>Display order<input type="number" min="0" max="10000" required value={periodForm.order} onChange={(event) => setPeriodForm({ ...periodForm, order: event.target.value })} /></label>
            <label className="admin-checkbox-label"><input type="checkbox" checked={periodForm.is_active} onChange={(event) => setPeriodForm({ ...periodForm, is_active: event.target.checked })} /> Visible on public timeline</label>
          </div>
          <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <>{editingPeriod ? 'Save changes' : <><Plus size={15} /> Create period</>}</>}</button>{editingPeriod && <button type="button" className="admin-cancel-button" onClick={cancelEdit}>Cancel</button>}</div>
        </form>
      </section>
      <section className="admin-panel admin-list-panel">
        <div className="admin-panel-heading"><div><span className="admin-panel-kicker">HISTORICAL STRUCTURE</span><h2>{periods.length} periods</h2></div></div>
        {periods.length ? <div className="admin-announcement-list">{periods.map((period) => <article className="admin-announcement-card" key={period.id}>
          <div className="admin-announcement-meta"><span className={`admin-status ${period.is_active ? 'status-active' : 'status-draft'}`}>{period.is_active ? 'Published' : 'Archived'}</span><span>{period.date_range || period.era || 'Historical period'}</span></div>
          <h3>{period.name}</h3><p>{period.description}</p>
          <small className="timeline-subperiod-summary">{(period.subperiods || []).join(' · ') || 'No subperiods added'} · Order {period.order}</small>
          <div className="admin-announcement-actions"><button onClick={() => startEditingPeriod(period)}><Pencil size={13} /> Edit</button><button onClick={() => archivePeriod(period)}>{period.is_active ? <><X size={14} /> Archive</> : <><RefreshCw size={13} /> Restore</>}</button></div>
        </article>)}</div> : <div className="admin-empty"><span><BookOpen size={20} /></span><b>No periods found</b><p>Add a period to begin building the timeline.</p></div>}
      </section>
    </div> : <div className="admin-management-grid">
      <section className="admin-panel admin-form-panel">
        <div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editingEntry ? 'EDIT A HISTORICAL PROFILE' : 'ADD A HISTORICAL PROFILE'}</span><h2>{editingEntry ? 'Edit entry' : 'New entry'}</h2></div></div>
        <form className="admin-form" onSubmit={saveEntry}>
          <label>Historical period<select required value={entryForm.period_id} onChange={(event) => setEntryForm({ ...entryForm, period_id: event.target.value, subperiod: '' })}><option value="">Choose period</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.name}{period.is_active ? '' : ' (archived)'}</option>)}</select></label>
          <label>Subperiod<select value={entryForm.subperiod} onChange={(event) => setEntryForm({ ...entryForm, subperiod: event.target.value })}><option value="">No specific subperiod</option>{(periods.find((period) => period.id === entryForm.period_id)?.subperiods || []).map((subperiod) => <option value={subperiod} key={subperiod}>{subperiod}</option>)}</select></label>
          <div className="timeline-form-row">
            <label>Entry type<select value={entryForm.entry_type} onChange={(event) => setEntryForm({ ...entryForm, entry_type: event.target.value })}>{entryTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Date range<input required maxLength={100} value={entryForm.date_range} onChange={(event) => setEntryForm({ ...entryForm, date_range: event.target.value })} placeholder="e.g. c. 322–185 BCE" /></label>
          </div>
          <label>Name / title<input required maxLength={120} value={entryForm.title} onChange={(event) => setEntryForm({ ...entryForm, title: event.target.value })} placeholder="e.g. Maurya Empire" /></label>
          <div className="timeline-form-row">
            <label>Region<input maxLength={200} value={entryForm.region} onChange={(event) => setEntryForm({ ...entryForm, region: event.target.value })} placeholder="Geographic extent" /></label>
            <label>Capital or centre<input maxLength={120} value={entryForm.capital} onChange={(event) => setEntryForm({ ...entryForm, capital: event.target.value })} placeholder="e.g. Pataliputra" /></label>
          </div>
          <label>Rulers, leaders or key figures<input maxLength={500} value={entryForm.leaders} onChange={(event) => setEntryForm({ ...entryForm, leaders: event.target.value })} placeholder="Separate names with commas" /></label>
          <label>Overview<textarea required maxLength={4000} rows={4} value={entryForm.overview} onChange={(event) => setEntryForm({ ...entryForm, overview: event.target.value })} placeholder="Describe the civilization, kingdom, event or movement" /></label>
          <label>Major achievements<textarea maxLength={3000} rows={3} value={entryForm.achievements} onChange={(event) => setEntryForm({ ...entryForm, achievements: event.target.value })} placeholder="Knowledge, arts, governance, technology and other contributions" /></label>
          <label>Historical legacy<textarea maxLength={3000} rows={3} value={entryForm.legacy} onChange={(event) => setEntryForm({ ...entryForm, legacy: event.target.value })} placeholder="Influence and continuing significance" /></label>
          <div className="timeline-child-subperiods">
            <div className="timeline-child-heading"><b>Specific subperiods</b><span>{entryForm.subperiods.length} / 30</span></div>
            <p>Add phases or chapters that belong to this profile only. You can add or edit them later.</p>
            {entryForm.subperiods.map((subperiod, index) => <fieldset className="timeline-child-subperiod" key={index}>
              <legend>SUBPERIOD {String(index + 1).padStart(2, '0')}</legend>
              <button type="button" className="timeline-child-remove" aria-label={`Remove subperiod ${index + 1}`} onClick={() => setEntryForm({ ...entryForm, subperiods: entryForm.subperiods.filter((_, itemIndex) => itemIndex !== index) })}><X size={14} /></button>
              <label>Name<input required maxLength={100} value={subperiod.name} onChange={(event) => updateSpecificSubperiod(index, { name: event.target.value })} placeholder="e.g. Ashoka's reign" /></label>
              <label>Date range<input maxLength={100} value={subperiod.date_range} onChange={(event) => updateSpecificSubperiod(index, { date_range: event.target.value })} placeholder="Optional" /></label>
              <label>Details<textarea maxLength={2000} rows={2} value={subperiod.description} onChange={(event) => updateSpecificSubperiod(index, { description: event.target.value })} placeholder="What distinguishes this phase?" /></label>
            </fieldset>)}
            <button type="button" className="timeline-add-subperiod" disabled={entryForm.subperiods.length >= 30} onClick={() => setEntryForm({ ...entryForm, subperiods: [...entryForm.subperiods, { name: '', date_range: '', description: '' }] })}><Plus size={14} /> Add a profile-specific subperiod</button>
          </div>
          <div className="timeline-form-row">
            <label>Display order<input type="number" min="0" max="10000" required value={entryForm.order} onChange={(event) => setEntryForm({ ...entryForm, order: event.target.value })} /></label>
            <label className="admin-checkbox-label"><input type="checkbox" checked={entryForm.is_published} onChange={(event) => setEntryForm({ ...entryForm, is_published: event.target.checked })} /> Publish publicly</label>
          </div>
          <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <>{editingEntry ? 'Save changes' : <><Plus size={15} /> Create profile</>}</>}</button>{editingEntry && <button type="button" className="admin-cancel-button" onClick={cancelEdit}>Cancel</button>}</div>
        </form>
      </section>
      <section className="admin-panel admin-list-panel">
        <div className="admin-panel-heading"><div><span className="admin-panel-kicker">KINGDOMS & CIVILISATIONS</span><h2>{entries.length} historical profiles</h2></div></div>
        {entries.length ? <div className="admin-announcement-list">{entries.map((entry) => <article className="admin-announcement-card" key={entry.id}>
          <div className="admin-announcement-meta"><span className={`admin-status ${entry.is_published ? 'status-active' : 'status-draft'}`}>{entry.is_published ? 'Published' : 'Draft'}</span><span>{entry.date_range}</span></div>
          <h3>{entry.title}</h3><p>{entry.period_name}{entry.subperiod ? ` · ${entry.subperiod}` : ''} · {entryTypes.find(([value]) => value === entry.entry_type)?.[1] || 'Historical entry'}</p>
          <small className="timeline-subperiod-summary">{entry.region || 'Region not specified'}{entry.capital ? ` · Centre: ${entry.capital}` : ''}</small>
          {!!entry.subperiods?.length && <small className="timeline-subperiod-summary">{entry.subperiods.length} specific subperiods: {entry.subperiods.map((subperiod) => subperiod.name).join(' · ')}</small>}
          <div className="admin-announcement-actions"><button onClick={() => startEditingEntry(entry)}><Pencil size={13} /> Edit</button><button onClick={() => deleteEntry(entry)}><X size={14} /> Delete</button></div>
        </article>)}</div> : <div className="admin-empty"><span><Landmark size={20} /></span><b>No historical profiles yet</b><p>Add kingdoms, civilizations, movements, institutions and events to enrich the public timeline.</p></div>}
      </section>
    </div>}
  </div>;
}
