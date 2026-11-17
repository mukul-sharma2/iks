import { ArrowDown, ArrowRight, BookOpen, Compass, Feather, Landmark, ScrollText, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const domains = [
  { icon: Compass, name: 'Astronomy & mathematics', detail: 'The mathematics that measured the heavens and mapped the world.' },
  { icon: Sparkles, name: 'Ayurveda & Yoga', detail: 'Timeless traditions of wellbeing, balance and self-knowledge.' },
  { icon: Feather, name: 'Philosophy & literature', detail: 'Ideas, epics and poetry that continue to shape human thought.' },
  { icon: Landmark, name: 'Architecture & society', detail: 'The built worlds, learning centres and communities of India.' },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-image" role="img" aria-label="Ancient Indian temple in the golden light of dawn" />
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="eyebrow eyebrow-light"><span /> A LIVING HERITAGE OF KNOWLEDGE</div>
          <h1>Wisdom that<br /><em>travels through time.</em></h1>
          <p>Journey into India's remarkable traditions of learning — and discover how ancient ideas illuminate the questions we ask today.</p>
          <div className="hero-actions">
            <Link to="/explore" className="button">Explore the knowledge <ArrowRight size={17} /></Link>
            <Link to="/about" className="text-link-light">Discover IKS <span>↗</span></Link>
          </div>
        </div>
        <div className="hero-caption"><span className="caption-line" /> A JOURNEY ACROSS MILLENNIA <span>01 — 03</span></div>
        <a className="scroll-cue" href="#welcome"><ArrowDown size={16} /> SCROLL TO EXPLORE</a>
        <span className="hero-ornament" aria-hidden="true">❧</span>
      </section>

      <section className="welcome-section section-wrap" id="welcome">
        <div className="welcome-copy">
          <div className="eyebrow"><span /> THE INDIAN KNOWLEDGE SYSTEM</div>
          <h2>A civilisation of<br /><em>thinkers & seekers.</em></h2>
          <p className="intro-copy">Across centuries, scholars, healers, mathematicians and poets developed a vast body of knowledge — observed, debated, practised and passed from one generation to the next.</p>
          <p>IKS brings these interconnected ways of knowing into one thoughtful learning space. Explore their histories, understand their contexts, and encounter the ideas for yourself.</p>
          <Link to="/about" className="underlined-link">The story behind IKS <ArrowRight size={16} /></Link>
        </div>
        <div className="welcome-art">
          <div className="art-frame">
            <img src="https://images.unsplash.com/photo-1606293926075-69a00dbfde81?auto=format&fit=crop&w=1000&q=85" alt="Intricate carved pillars in an Indian heritage temple" />
            <div className="art-note"><span className="note-symbol">ॐ</span><span>AN UNBROKEN<br />CULTURE OF INQUIRY</span></div>
          </div>
          <span className="art-vertical">BHARATIYA JNANA PARAMPARA</span>
        </div>
      </section>

      <section className="domains-section">
        <div className="section-wrap">
          <div className="section-heading">
            <div><div className="eyebrow eyebrow-light"><span /> MANY PATHS OF KNOWING</div><h2>Explore the <em>traditions.</em></h2></div>
            <Link className="text-link-light" to="/explore">All knowledge domains <ArrowRight size={16} /></Link>
          </div>
          <div className="domain-grid">
            {domains.map(({ icon: Icon, name, detail }, index) => (
              <Link to="/explore" className="domain-card" key={name}>
                <span className="domain-number">0{index + 1}</span>
                <Icon className="domain-icon" size={25} strokeWidth={1.5} />
                <h3>{name}</h3>
                <p>{detail}</p>
                <span className="domain-arrow"><ArrowRight size={18} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="timeline-preview section-wrap">
        <div className="timeline-copy">
          <div className="eyebrow"><span /> IDEAS ACROSS THE AGES</div>
          <h2>History is not<br />behind us. It is <em>within us.</em></h2>
          <p>Trace knowledge as it travelled, transformed and took root — from the cities of the Indus Valley to the vibrant intellectual movements of modern India.</p>
          <Link to="/timeline" className="underlined-link">Walk the timeline <ArrowRight size={16} /></Link>
        </div>
        <div className="timeline-art">
          <div className="timeline-ruler">
            <div><span className="ruler-dot" /><b>c. 2600 BCE</b><small>Indus Valley</small></div>
            <div><span className="ruler-dot" /><b>c. 1500 BCE</b><small>Vedic traditions</small></div>
            <div><span className="ruler-dot" /><b>c. 320 CE</b><small>Gupta age</small></div>
            <div><span className="ruler-dot" /><b>Present</b><small>A living tradition</small></div>
          </div>
          <div className="timeline-quote"><ScrollText size={23} /><p>“Let noble thoughts come to us from every side.”</p><small>— RIG VEDA 1.89.1</small></div>
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-inner">
          <div className="eyebrow eyebrow-light"><span /> YOUR JOURNEY BEGINS HERE</div>
          <h2>Come curious.<br /><em>Leave connected.</em></h2>
          <p>Open a new chapter in your understanding of India's knowledge heritage.</p>
          <Link to="/register" className="button button-light">Create your learner account <ArrowRight size={17} /></Link>
        </div>
        <span className="cta-motif" aria-hidden="true">✳</span>
      </section>
    </>
  );
}
