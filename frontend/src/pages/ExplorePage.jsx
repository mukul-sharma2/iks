import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, LoaderCircle } from 'lucide-react';
import api, { getApiError } from '../services/api.js';

const starterDomains = ['Indian Mathematics', 'Astronomy', 'Ayurveda', 'Yoga', 'Indian Philosophy', 'Sanskrit Literature', 'Architecture', 'Agriculture', 'Metallurgy', 'Education Systems'];

export default function ExplorePage() {
  const [categories, setCategories] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/categories'), api.get('/periods')])
      .then(([categoryResponse, periodResponse]) => {
        if (active) {
          setCategories(categoryResponse.data.categories || []);
          setPeriods(periodResponse.data.periods || []);
        }
      })
      .catch((requestError) => { if (active) setError(getApiError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const displayedDomains = categories.length ? categories : starterDomains.map((name, index) => ({ _id: `starter-${index}`, name }));

  return <div className="editorial-page">
    <section className="page-masthead">
      <div className="eyebrow"><span /> A LIBRARY WITHOUT WALLS</div>
      <h1>Follow your<br /><em>curiosity.</em></h1>
      <p>Explore the ideas, disciplines and historical worlds that form India's knowledge heritage.</p>
    </section>
    <section className="explore-content section-wrap">
      {error && <div className="inline-notice" role="status">{error} Showing the introductory catalogue for now.</div>}
      <div className="explore-heading"><div><div className="eyebrow"><span /> KNOWLEDGE DOMAINS</div><h2>Ways of <em>knowing.</em></h2></div>{loading && <LoaderCircle className="spin" size={20} />}</div>
      <div className="explore-domain-grid">
        {displayedDomains.map((domain, index) => <article className="explore-domain" key={domain._id || domain.id || domain.name}>
          <span className="domain-number">DOMAIN / {String(index + 1).padStart(2, '0')}</span>
          <BookOpen size={21} strokeWidth={1.5} />
          <h3>{domain.name}</h3>
          <p>{domain.description || 'Discover the practices, histories and ideas that shaped this field of knowledge.'}</p>
          <span className="explore-arrow"><ArrowRight size={16} /></span>
        </article>)}
      </div>
      <div className="periods-block">
        <div className="eyebrow"><span /> CONTEXT THROUGH TIME</div><h2>Worlds that <em>shaped ideas.</em></h2>
        {periods.length > 0 ? <div className="period-grid">{periods.map((period) => <article key={period._id || period.id}><span>{period.date_range || period.era || 'HISTORICAL PERIOD'}</span><h3>{period.name}</h3><p>{period.description}</p>{period.subperiods?.length > 0 && <small className="explore-period-subperiods">{period.subperiods.join(' · ')}</small>}</article>)}</div> :
          <div className="period-grid">
            {[['01', 'Ancient India', 'Indus Valley · Vedic Period · Maurya · Gupta'], ['02', 'Medieval India', 'Delhi Sultanate · Mughal Period · Bhakti · Sufi'], ['03', 'Modern India', 'Colonial Period · Renaissance · Freedom Movement']].map(([number, name, content]) => <article key={name}><span>PERIOD / {number}</span><h3>{name}</h3><p>{content}</p></article>)}
          </div>}
      </div>
    </section>
  </div>;
}
