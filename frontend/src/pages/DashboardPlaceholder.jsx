import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, BookOpen, CheckCircle2, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardCheck, Clock3, FileText, KeyRound, Megaphone,
  RefreshCw, Save, UserRound, XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api, { downloadMaterialFile, getApiError } from '../services/api.js';

const AGE_GROUPS = ['10-13', '14-16', '17-19', '20+'];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudentHome() {
  const { user } = useAuth();
  const [section, setSection] = useState('home');
  const [categories, setCategories] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [stats, setStats] = useState(null);
  const [categoryId, setCategoryId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [ageGroup, setAgeGroup] = useState(user?.age_group || '');
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/categories'), api.get('/periods'), api.get('/announcements'), api.get('/student/dashboard')])
      .then(([categoryResponse, periodResponse, announcementResponse, dashboardResponse]) => {
        if (!active) return;
        setCategories(categoryResponse.data.categories || []);
        setPeriods(periodResponse.data.periods || []);
        setAnnouncements(announcementResponse.data.announcements || []);
        setStats(dashboardResponse.data.stats);
      })
      .catch((requestError) => { if (active) setError(getApiError(requestError)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingMaterials(true);
    const params = {};
    if (categoryId) params.category_id = categoryId;
    if (periodId) params.period_id = periodId;
    if (ageGroup) params.age_group = ageGroup;
    api.get('/materials', { params })
      .then(({ data }) => { if (active) setMaterials(data.materials || []); })
      .catch((requestError) => { if (active) setError(getApiError(requestError)); })
      .finally(() => { if (active) setLoadingMaterials(false); });
    return () => { active = false; };
  }, [categoryId, periodId, ageGroup]);

  const download = async (material) => {
    setError('');
    setDownloading(material.id);
    try {
      await downloadMaterialFile(material);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setDownloading('');
    }
  };

  return <div className="student-dashboard">
    <section className="student-welcome">
      <div className="eyebrow"><span /> YOUR LEARNING JOURNEY</div>
      <h1>Namaste, {user?.name?.split(' ')[0] || 'learner'}.</h1>
      <p>Welcome to your library of Indian knowledge. Choose a subject, follow a period through time, and begin exploring.</p>
      <div className="student-profile-note"><span className="student-profile-initial">{(user?.name || 'S').slice(0, 1).toUpperCase()}</span><span><b>{user?.name}</b><small>Student · Ages {user?.age_group || 'not specified'}</small></span></div>
    </section>

    <nav className="student-tabs" aria-label="My learning">
      <button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}><BookOpen size={15} /> Learning home</button>
      <button className={section === 'quizzes' ? 'active' : ''} onClick={() => setSection('quizzes')}><ClipboardCheck size={15} /> Quizzes</button>
      <button className={section === 'tests' ? 'active' : ''} onClick={() => setSection('tests')}><Clock3 size={15} /> Examinations</button>
      <button className={section === 'results' ? 'active' : ''} onClick={() => setSection('results')}><CheckCircle2 size={15} /> My results</button>
      <button className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}><UserRound size={15} /> Profile</button>
    </nav>

    {stats && <section className="student-stats-grid">
      <StudentStat label="AVAILABLE MATERIALS" value={stats.materials_available} detail="For your age group" />
      <StudentStat label="QUIZZES COMPLETED" value={stats.quizzes_completed} detail="Saved attempts" />
      <StudentStat label="EXAMS COMPLETED" value={stats.tests_completed} detail="Saved results" />
      <StudentStat label="AVERAGE SCORE" value={stats.average_score == null ? '—' : `${stats.average_score}%`} detail="Across your attempts" />
    </section>}

    {section === 'home' && <>
      {error && <div className="student-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}

      <section className="student-announcements">
        <div className="student-section-heading"><div><div className="eyebrow"><span /> FROM THE LEARNING COMMUNITY</div><h2>Recent <em>announcements.</em></h2></div><span className="student-count"><Megaphone size={14} /> {announcements.length}</span></div>
        {announcements.length ? <div className="student-announcement-grid">{announcements.slice(0, 3).map((announcement) => <article className="student-announcement" key={announcement.id}><span>{formatDate(announcement.created_at)}</span><h3>{announcement.title}</h3><p>{announcement.body}</p></article>)}</div> : <div className="student-quiet"><Megaphone size={16} /> No announcements yet. Check back soon.</div>}
      </section>

      <section className="student-library" id="study-materials">
        <div className="student-section-heading"><div><div className="eyebrow"><span /> THE DIGITAL STUDY COLLECTION</div><h2>Materials for <em>your journey.</em></h2></div><span className="student-count"><BookOpen size={14} /> {materials.length} found</span></div>
        <div className="student-filters">
          <label>Knowledge domain<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All domains</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>Historical period<select value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">All periods</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.name}</option>)}</select></label>
          <label>Age group<select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)}><option value="">All age groups</option>{AGE_GROUPS.map((group) => <option value={group} key={group}>{group}</option>)}</select></label>
        </div>
        {loadingMaterials ? <div className="student-loading"><RefreshCw className="spin" size={17} /> Opening the study collection…</div> : materials.length ? <div className="student-material-grid">{materials.map((material) => <article className="student-material-card" key={material.id}>
          <div className="student-material-top"><span className="student-file-icon"><FileText size={19} /></span><span className="student-file-type">{material.file_type.toUpperCase()}</span></div>
          <div className="student-material-meta">{material.category_name} <span>·</span> {material.period_name}</div>
          <h3>{material.title}</h3>
          <p>{material.description || 'Explore this learning resource from the IKS study collection.'}</p>
          <div className="student-material-bottom"><span>Ages {material.age_group} · {formatBytes(material.file_size)}</span><button onClick={() => download(material)} disabled={downloading === material.id} aria-label={`Download ${material.title}`}>{downloading === material.id ? <RefreshCw className="spin" size={15} /> : <><ArrowDownToLine size={15} /> Download</>}</button></div>
        </article>)}</div> : <div className="student-empty"><BookOpen size={21} /><b>No materials match these filters</b><p>Try a different knowledge domain, period or age group. New resources will appear here.</p></div>}
      </section>
    </>}

    {section === 'quizzes' && <StudentAssessments ageGroup={user?.age_group} assessmentType="quiz" />}
    {section === 'tests' && <StudentAssessments ageGroup={user?.age_group} assessmentType="test" />}
    {section === 'results' && <QuizResults />}
    {section === 'profile' && <StudentProfile />}
  </div>;
}

function StudentStat({ label, value, detail }) {
  return <article className="student-stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function StudentProfile() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || '', age_group: user?.age_group || '14-16', email: user?.email || '' });
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirmation: '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/student/profile')
      .then(({ data }) => { if (active) setProfile({ name: data.user.name, age_group: data.user.age_group || '14-16', email: data.user.email }); })
      .catch((requestError) => { if (active) setError(getApiError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setNotice('');
    try {
      await api.put('/student/profile', { name: profile.name, age_group: profile.age_group });
      await refreshUser();
      setNotice('Your profile has been updated.');
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (password.new_password !== password.confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.put('/student/profile/password', {
        current_password: password.current_password,
        new_password: password.new_password,
      });
      setPassword({ current_password: '', new_password: '', confirmation: '' });
      setNotice(data.message);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return <div className="student-loading"><RefreshCw className="spin" size={17} /> Opening your profile…</div>;
  return <section className="student-profile-page">
    <div className="student-section-heading"><div><div className="eyebrow"><span /> YOUR LEARNER ACCOUNT</div><h2>Personal <em>details.</em></h2></div></div>
    {error && <div className="student-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="student-profile-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
    <div className="student-profile-grid">
      <form className="student-profile-form" onSubmit={saveProfile}>
        <h3>Profile information</h3>
        <label>Full name<input required maxLength={80} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Email address<input type="email" value={profile.email} readOnly /><small>Email address cannot be changed here.</small></label>
        <label>Age group<select value={profile.age_group} onChange={(event) => setProfile({ ...profile, age_group: event.target.value })}><option value="10-13">10–13</option><option value="14-16">14–16</option><option value="17-19">17–19</option><option value="20+">20+</option></select></label>
        <button className="button" disabled={savingProfile}>{savingProfile ? 'Saving…' : <><Save size={15} /> Save profile</>}</button>
      </form>
      <form className="student-profile-form" onSubmit={savePassword}>
        <h3><KeyRound size={16} /> Change password</h3>
        <label>Current password<input type="password" autoComplete="current-password" required value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} /></label>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} /><small>Use at least 8 characters.</small></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password.confirmation} onChange={(event) => setPassword({ ...password, confirmation: event.target.value })} /></label>
        <button className="button" disabled={savingPassword}>{savingPassword ? 'Updating…' : <>Update password <KeyRound size={15} /></>}</button>
      </form>
    </div>
  </section>;
}

function StudentAssessments({ ageGroup, assessmentType }) {
  const isTest = assessmentType === 'test';
  const plural = isTest ? 'tests' : 'quizzes';
  const assessmentLabel = isTest ? 'examination' : 'quiz';
  const pluralLabel = isTest ? 'examinations' : 'quizzes';
  const [quizzes, setQuizzes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const submitRef = useRef(null);

  useEffect(() => {
    api.get('/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch((requestError) => setError(getApiError(requestError)));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/${plural}`, { params: categoryId ? { category_id: categoryId } : {} })
      .then(({ data }) => { if (active) setQuizzes(data.quizzes || data.tests || []); })
      .catch((requestError) => { if (active) setError(getApiError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [categoryId, plural]);

  const submitAttempt = useCallback(async () => {
    if (!attempt || savingAnswer || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/student/${plural}/attempts/${attempt.id}/submit`);
      setResult(data.result);
      setAttempt(null);
    } catch (requestError) {
      if (requestError.response?.data?.result) {
        setResult(requestError.response.data.result);
        setAttempt(null);
      } else {
        setError(getApiError(requestError));
        submitLock.current = false;
      }
    } finally {
      setSubmitting(false);
    }
  }, [attempt, savingAnswer, plural]);

  useEffect(() => { submitRef.current = submitAttempt; }, [submitAttempt]);

  useEffect(() => {
    if (!attempt) return undefined;
    const expiresAt = new Date(attempt.expires_at).getTime();
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) submitRef.current?.();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.id]);

  const startQuiz = async (item) => {
    setError('');
    setResult(null);
    submitLock.current = false;
    try {
      const { data } = await api.post(`/student/${plural}/${item.id}/start`);
      setQuiz(data[assessmentType]);
      setQuestions(data.questions);
      setAttempt(data.attempt);
      setAnswers(data.attempt.answers || {});
      setQuestionIndex(0);
    } catch (requestError) {
      if (requestError.response?.data?.result) {
        setResult(requestError.response.data.result);
      } else {
        setError(getApiError(requestError));
      }
    }
  };

  const chooseAnswer = async (question, optionIndex) => {
    if (!attempt || savingAnswer) return;
    setSavingAnswer(true);
    setError('');
    try {
      await api.put(`/student/${plural}/attempts/${attempt.id}/answers`, {
        question_id: question.id,
        selected_option: optionIndex,
      });
      setAnswers((previous) => ({ ...previous, [question.id]: optionIndex }));
    } catch (requestError) {
      if (requestError.response?.data?.result) {
        setResult(requestError.response.data.result);
        setAttempt(null);
      } else {
        setError(getApiError(requestError));
      }
    } finally {
      setSavingAnswer(false);
    }
  };

  const leaveAttempt = () => {
    if (!window.confirm('Leave this quiz? Your saved answers and timer will remain active.')) return;
    setAttempt(null);
    setQuiz(null);
    setQuestions([]);
    submitLock.current = false;
  };

  if (result) return <QuizResultCard result={result} onBack={() => setResult(null)} />;

  if (attempt && quiz) {
    const question = questions[questionIndex];
    return <section className="quiz-attempt">
      <header className="quiz-attempt-heading"><div><span className="admin-panel-kicker">{quiz.category_name} · {quiz.age_group}</span><h2>{quiz.title}</h2></div><div className={remaining < 60 ? 'quiz-timer urgent' : 'quiz-timer'}><Clock3 size={17} /> {formatTime(remaining)}</div></header>
      {error && <div className="student-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      <div className="quiz-progress-track"><span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
      <div className="quiz-question-card">
        <div className="quiz-question-meta"><span>QUESTION {String(questionIndex + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}</span><span>{answers[question.id] !== undefined ? 'Answer saved' : 'Not answered'}</span></div>
        <h3>{question.prompt}</h3>
        <div className="quiz-options">{question.options.map((option, index) => <button key={index} disabled={savingAnswer} className={answers[question.id] === index ? 'quiz-option selected' : 'quiz-option'} onClick={() => chooseAnswer(question, index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
        {savingAnswer && <small className="quiz-saving">Saving your answer…</small>}
      </div>
      <div className="quiz-question-nav">{questions.map((item, index) => <button key={item.id} className={`${index === questionIndex ? 'current' : ''} ${answers[item.id] !== undefined ? 'answered' : ''}`} onClick={() => setQuestionIndex(index)} aria-label={`Go to question ${index + 1}`}>{index + 1}</button>)}</div>
      <footer className="quiz-attempt-actions"><button className="quiz-secondary" onClick={leaveAttempt}>Leave quiz</button><div><button className="quiz-secondary" disabled={questionIndex === 0} onClick={() => setQuestionIndex(questionIndex - 1)}><ChevronLeft size={15} /> Previous</button>{questionIndex < questions.length - 1 ? <button className="button" onClick={() => setQuestionIndex(questionIndex + 1)}>Next <ChevronRight size={15} /></button> : <button className="button" disabled={submitting || savingAnswer} onClick={() => { if (window.confirm('Submit your quiz now?')) submitAttempt(); }}>{submitting ? 'Submitting…' : 'Submit quiz'}</button>}</div></footer>
    </section>;
  }

  return <section className="student-quizzes">
    <div className="student-section-heading"><div><div className="eyebrow"><span /> {isTest ? 'SCHEDULED ASSESSMENTS' : 'CHECK YOUR UNDERSTANDING'}</div><h2>Available <em>{pluralLabel}.</em></h2></div><span className="student-count"><CircleHelp size={15} /> Ages {ageGroup || 'all'}</span></div>
    <div className="student-filters quiz-filter"><label>Knowledge domain<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All domains</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div>
    {error && <div className="student-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {loading ? <div className="student-loading"><RefreshCw className="spin" size={17} /> Finding your {pluralLabel}…</div> : quizzes.length ? <div className="quiz-card-grid">{quizzes.map((item) => <article className="quiz-list-card" key={item.id}><span className="quiz-list-icon">{isTest ? <Clock3 size={19} /> : <ClipboardCheck size={19} />}</span><div className="student-material-meta">{item.category_name} · {item.period_name}</div><h3>{item.title}</h3><p>{item.description || `A multiple-choice ${assessmentLabel} to explore this topic.`}</p><div className="quiz-list-details"><span><Clock3 size={13} /> {item.duration_minutes} min</span><span>{item.question_count} questions</span><span>{item.total_marks} marks</span></div>{isTest && <small className="student-test-schedule">{item.is_available ? 'Open now' : `Opens ${formatDate(item.scheduled_at)}`} · Closes {formatDate(item.closes_at)} · Pass {item.passing_marks} marks</small>}<button className="button" disabled={isTest && !item.is_available} onClick={() => startQuiz(item)}>{isTest ? (item.is_available ? 'Start examination' : 'Not open yet') : 'Start quiz'} <ChevronRight size={15} /></button></article>)}</div> : <div className="student-empty">{isTest ? <Clock3 size={21} /> : <ClipboardCheck size={21} />}<b>No {pluralLabel} available</b><p>{isTest ? 'Scheduled examinations for your age group will appear here.' : 'Quizzes for your age group will appear here when your instructor publishes them.'}</p></div>}
  </section>;
}

function QuizResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/student/results')
      .then(({ data }) => setResults(data.results || []))
      .catch((requestError) => setError(getApiError(requestError)))
      .finally(() => setLoading(false));
  }, []);
  return <section className="student-results">
    <div className="student-section-heading"><div><div className="eyebrow"><span /> YOUR LEARNING RECORD</div><h2>Quiz <em>results.</em></h2></div><span className="student-count"><CheckCircle2 size={15} /> {results.length} attempts</span></div>
    {error && <div className="student-error" role="alert">{error}</div>}
    {loading ? <div className="student-loading"><RefreshCw className="spin" size={17} /> Gathering your results…</div> : results.length ? <div className="quiz-results-list">{results.map((result) => <details className="quiz-result-entry" key={result.id}><summary><span><b>{result.assessment_title || result.quiz_title}</b><small>{result.assessment_type === 'test' ? 'Examination' : 'Quiz'} · {formatDate(result.submitted_at)}{result.timed_out ? ' · Time expired' : ''}</small></span><strong>{result.score} / {result.total_marks}</strong><span className="quiz-result-correct">{result.passed === true ? 'Passed · ' : result.passed === false ? 'Not passed · ' : ''}{result.correct_count}/{result.question_count} correct</span></summary><div className="quiz-result-details">{result.results.map((item, index) => <ResultQuestion key={item.question_id} item={item} index={index} />)}</div></details>)}</div> : <div className="student-empty"><CheckCircle2 size={21} /><b>No results yet</b><p>Complete a quiz or examination and your score and explanations will be saved here.</p></div>}
  </section>;
}

function QuizResultCard({ result, onBack }) {
  return <section className="quiz-result-page">
    <div className="eyebrow"><span /> {result.timed_out ? 'TIME EXPIRED · SUBMITTED AUTOMATICALLY' : 'QUIZ SUBMITTED'}</div>
    <h2>{result.assessment_title || result.quiz_title || result.test_title}</h2>
    <div className="quiz-score-card"><span>Your score</span><strong>{result.score} <small>/ {result.total_marks}</small></strong><p>{result.correct_count} of {result.question_count} answered correctly</p></div>
    {result.passed !== null && result.passed !== undefined && <div className={result.passed ? 'test-outcome passed' : 'test-outcome failed'}>{result.passed ? 'You passed this examination.' : 'You did not reach the passing mark.'}{result.passing_marks != null && ` Passing mark: ${result.passing_marks}.`}</div>}
    <div className="quiz-result-details">{result.results.map((item, index) => <ResultQuestion key={item.question_id} item={item} index={index} />)}</div>
    <button className="button" onClick={onBack}>Return to quizzes</button>
  </section>;
}

function ResultQuestion({ item, index }) {
  return <article className="quiz-review-item">
    <div className="quiz-review-title">{item.is_correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<b>Question {index + 1}</b></div>
    <p>{item.prompt}</p>
    <small>Your answer: {item.selected_option == null ? 'Not answered' : item.options[item.selected_option]}</small>
    {!item.is_correct && <small>Correct answer: {item.options[item.correct_option]}</small>}
    {item.explanation && <div className="quiz-explanation">{item.explanation}</div>}
  </article>;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}
