import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Compass, Leaf, Lightbulb } from 'lucide-react';

const principles = [
  { icon: BookOpen, title: 'Many sources, many voices', copy: 'Knowledge flourished in texts and conversations, in workshops and fields, across languages, regions and communities.' },
  { icon: Compass, title: 'Learning through inquiry', copy: 'Observation, reasoning, debate and practice were ways to test ideas and deepen understanding.' },
  { icon: Leaf, title: 'A whole-world perspective', copy: 'Many Indian traditions explore the relationship between the self, society, nature and the cosmos.' },
  { icon: Lightbulb, title: 'A living inheritance', copy: 'IKS is not only a record of the past. Its questions, practices and insights continue to evolve.' },
];

export default function AboutPage() {
  return (
    <div className="editorial-page">
      <section className="page-masthead">
        <div className="eyebrow"><span /> ABOUT THE PLATFORM</div>
        <h1>Knowledge rooted<br />in <em>civilisation.</em></h1>
        <p>Indian Knowledge Systems are the many ways of knowing, making and living that have developed across the Indian subcontinent.</p>
      </section>
      <section className="about-intro section-wrap">
        <div>
          <span className="section-index">01 / A BEGINNING</span>
          <h2>Not one story.<br /><em>A thousand conversations.</em></h2>
        </div>
        <div className="about-prose">
          <p className="intro-copy">The Indian Knowledge Systems (IKS) learning platform is a place to encounter the intellectual and cultural traditions of India with care, context and curiosity.</p>
          <p>From early astronomical observations and sophisticated mathematical ideas to systems of medicine, architecture, philosophy and literature, these traditions reflect generations of careful thought and practice. They are diverse, changing and connected to the lives of the people who carried them.</p>
          <p>Our purpose is to make these histories accessible to learners — and to invite questions, not simply offer conclusions.</p>
        </div>
      </section>
      <section className="principles-section">
        <div className="section-wrap">
          <div className="eyebrow"><span /> HOW WE APPROACH THE PAST</div>
          <h2>Four ideas that <em>guide us.</em></h2>
          <div className="principle-grid">
            {principles.map(({ icon: Icon, title, copy }, index) => <article className="principle-card" key={title}>
              <span className="principle-num">0{index + 1}</span><Icon size={22} strokeWidth={1.6} />
              <h3>{title}</h3><p>{copy}</p>
            </article>)}
          </div>
        </div>
      </section>
      <section className="about-cta section-wrap">
        <div><div className="eyebrow"><span /> TAKE THE NEXT STEP</div><h2>Begin with a <em>question.</em></h2><p>Choose a path and start exploring India's intellectual heritage.</p></div>
        <Link className="button" to="/explore">Explore knowledge <ArrowRight size={17} /></Link>
      </section>
    </div>
  );
}
