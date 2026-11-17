import { useEffect, useState } from 'react';
import { Landmark, RefreshCw } from 'lucide-react';
import api, { getApiError } from '../services/api.js';

const typeLabels = {
  civilization: 'Civilization',
  kingdom: 'Kingdom or empire',
  event: 'Historical event',
  movement: 'Movement or tradition',
  institution: 'Institution',
  other: 'Historical profile',
};

export default function TimelinePage() {
  const [periods, setPeriods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get('/timeline')
      .then(({ data }) => {
        if (active) {
          setPeriods(data.periods || []);
          setEntries(data.entries || []);
          setError('');
        }
      })
      .catch((requestError) => { if (active) setError(getApiError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const entriesByPeriod = entries.reduce((grouped, entry) => {
    const periodEntries = grouped.get(entry.period_id) || [];
    periodEntries.push(entry);
    grouped.set(entry.period_id, periodEntries);
    return grouped;
  }, new Map());

  return <div className="editorial-page">
    <section className="page-masthead timeline-masthead">
      <div className="eyebrow"><span /> A TIMELINE OF IDEAS</div>
      <h1>Time moves.<br /><em>Knowledge travels.</em></h1>
      <p>A selective journey through the historical worlds where India's many knowledge traditions took shape and changed.</p>
    </section>
    <section className="timeline-page-content section-wrap">
      <div className="timeline-intro"><span className="section-index">A NOTE ON TIME</span><p className="intro-copy">History is not a single straight line. These milestones offer one way to orient ourselves — each period held many overlapping stories, communities and intellectual traditions.</p></div>
      {error && <div className="inline-notice" role="alert">{error} <button className="timeline-retry" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
      {loading ? <div className="timeline-state"><RefreshCw className="spin" size={17} /> Gathering the historical records…</div> : !error && periods.length === 0 ?
        <div className="timeline-state">The historical timeline has not been published yet.</div> :
        <div className="history-list">
          {periods.map((period, index) => {
            const periodEntries = entriesByPeriod.get(period.id) || [];
            return <article className="history-period" key={period.id}>
              <div className="history-date">{period.date_range || period.era || 'HISTORICAL PERIOD'}</div>
              <span className="history-point" />
              <div className="history-description">
                <span>CHAPTER {String(index + 1).padStart(2, '0')}{period.era ? ` · ${period.era}` : ''}</span>
                <h2>{period.name}</h2>
                {period.description && <p className="history-period-summary">{period.description}</p>}
                {!!period.subperiods?.length && <div className="history-subperiods" aria-label="Subperiods">
                  {period.subperiods.map((subperiod) => <span key={subperiod}>{subperiod}</span>)}
                </div>}
                {periodEntries.length ? <div className="history-entry-list">
                  {periodEntries.map((entry) => <article className="history-entry" key={entry.id}>
                    <div className="history-entry-top"><span><Landmark size={13} /> {typeLabels[entry.entry_type] || 'Historical profile'}</span><time>{entry.date_range}</time></div>
                    <h3>{entry.title}</h3>
                    {entry.subperiod && <span className="history-entry-subperiod">{entry.subperiod}</span>}
                    <p>{entry.overview}</p>
                    {!!entry.subperiods?.length && <div className="history-specific-subperiods">
                      <b>Phases within {entry.title}</b>
                      <div>{entry.subperiods.map((subperiod) => <article key={subperiod.name}>
                        <h4>{subperiod.name}{subperiod.date_range && <span> · {subperiod.date_range}</span>}</h4>
                        {subperiod.description && <p>{subperiod.description}</p>}
                      </article>)}</div>
                    </div>}
                    {(entry.region || entry.capital || entry.leaders) && <dl className="history-facts">
                      {entry.region && <div><dt>Region</dt><dd>{entry.region}</dd></div>}
                      {entry.capital && <div><dt>Capital / centre</dt><dd>{entry.capital}</dd></div>}
                      {entry.leaders && <div><dt>Key figures</dt><dd>{entry.leaders}</dd></div>}
                    </dl>}
                    {entry.achievements && <div className="history-entry-detail"><b>Achievements & contributions</b><p>{entry.achievements}</p></div>}
                    {entry.legacy && <div className="history-entry-detail"><b>Legacy</b><p>{entry.legacy}</p></div>}
                  </article>)}
                </div> : <p className="history-empty">Detailed kingdom and civilization profiles for this period will be added by the curator.</p>}
              </div>
            </article>;
          })}
        </div>}
    </section>
  </div>;
}
