import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ArrowDownToLine, Bell, BookOpen, Check, ChevronRight, FileText, Landmark,
  ClipboardCheck, GraduationCap, LayoutDashboard, LogOut, Megaphone, Pencil, Plus,
  RefreshCw, ShieldCheck, Users, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { downloadMaterialFile, getApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import TimelineManagement from './TimelineManagement.jsx';

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'categories', label: 'Syllabus', icon: BookOpen },
  { id: 'timeline', label: 'Historical timeline', icon: Landmark },
  { id: 'materials', label: 'Study materials', icon: FileText },
  { id: 'quizzes', label: 'Quizzes', icon: ClipboardCheck },
  { id: 'tests', label: 'Examinations', icon: ClipboardCheck },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
];

const emptyStats = { students: 0, active_students: 0, materials: 0, quizzes: 0, tests: 0, attempts: 0, average_score: null };
const emptyCategory = { name: '', description: '', parent_id: '', period_id: '' };
const emptyAnnouncement = { title: '', body: '', is_published: true };
const emptyMaterial = { title: '', description: '', category_id: '', period_id: '', age_group: '14-16', file: null };
const newQuizForm = () => ({
  title: '',
  description: '',
  category_id: '',
  period_id: '',
  age_group: '14-16',
  duration_minutes: '15',
  total_marks: '10',
  questions: [{ prompt: '', options: ['', '', '', ''], correct_option: 0, explanation: '' }],
});
const newTestForm = () => ({
  ...newQuizForm(),
  passing_marks: '4',
  scheduled_at: '',
  closes_at: '',
});

function toLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function Metric({ icon: Icon, label, value, note }) {
  return <article className="admin-metric">
    <span className="admin-metric-icon"><Icon size={18} strokeWidth={1.6} /></span>
    <span className="admin-metric-label">{label}</span>
    <strong>{value ?? '—'}</strong>
    <small>{note}</small>
  </article>;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stats, setStats] = useState(emptyStats);
  const [recentStudents, setRecentStudents] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentDetail, setStudentDetail] = useState(null);
  const [loadingStudentId, setLoadingStudentId] = useState('');
  const [categories, setCategories] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingCategory, setEditingCategory] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState(emptyAnnouncement);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [quizForm, setQuizForm] = useState(newQuizForm);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [tests, setTests] = useState([]);
  const [testResults, setTestResults] = useState(null);
  const [testForm, setTestForm] = useState(newTestForm);
  const [editingTest, setEditingTest] = useState(null);
  const [timelineRefreshToken, setTimelineRefreshToken] = useState(0);

  const loadSection = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (section === 'overview') {
        const { data } = await api.get('/admin/dashboard');
        setStats(data.stats);
        setRecentStudents(data.recent_students || []);
      } else if (section === 'students') {
        const { data } = await api.get('/admin/students');
        setStudents(data.students || []);
      } else if (section === 'categories') {
        const [categoryResponse, periodResponse] = await Promise.all([
          api.get('/admin/categories'),
          api.get('/periods'),
        ]);
        setCategories(categoryResponse.data.categories || []);
        setPeriods(periodResponse.data.periods || []);
      } else if (section === 'announcements') {
        const { data } = await api.get('/admin/announcements');
        setAnnouncements(data.announcements || []);
      } else if (section === 'materials') {
        const [materialResponse, categoryResponse, periodResponse] = await Promise.all([
          api.get('/materials'),
          api.get('/admin/categories'),
          api.get('/periods'),
        ]);
        setMaterials(materialResponse.data.materials || []);
        setCategories(categoryResponse.data.categories || []);
        setPeriods(periodResponse.data.periods || []);
      } else if (section === 'quizzes') {
        const [quizResponse, categoryResponse, periodResponse] = await Promise.all([
          api.get('/admin/quizzes'),
          api.get('/admin/categories'),
          api.get('/periods'),
        ]);
        setQuizzes(quizResponse.data.quizzes || []);
        setCategories(categoryResponse.data.categories || []);
        setPeriods(periodResponse.data.periods || []);
      } else if (section === 'tests') {
        const [testResponse, categoryResponse, periodResponse] = await Promise.all([
          api.get('/admin/tests'),
          api.get('/admin/categories'),
          api.get('/periods'),
        ]);
        setTests(testResponse.data.tests || []);
        setCategories(categoryResponse.data.categories || []);
        setPeriods(periodResponse.data.periods || []);
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => { loadSection(); }, [loadSection]);

  const refreshSection = () => {
    if (section === 'timeline') setTimelineRefreshToken((value) => value + 1);
    else loadSection();
  };

  const changeSection = (next) => {
    setSection(next);
    setMobileNav(false);
    setError('');
    setNotice('');
  };

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingCategory) {
        await api.put(`/admin/categories/${editingCategory.id}`, {
          name: categoryForm.name,
          description: categoryForm.description,
        });
        setNotice('Syllabus category updated.');
      } else {
        await api.post('/admin/categories', {
          ...categoryForm,
          parent_id: categoryForm.parent_id || null,
          period_id: categoryForm.period_id || null,
        });
        setNotice('Syllabus category created.');
      }
      setCategoryForm(emptyCategory);
      setEditingCategory(null);
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (category) => {
    if (!window.confirm(`Delete “${category.name}”? Categories in use cannot be deleted.`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/admin/categories/${category.id}`);
      setNotice('Syllabus category deleted.');
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const setStudentActive = async (student) => {
    setError('');
    setNotice('');
    try {
      await api.patch(`/admin/students/${student.id}/status`, { is_active: !student.is_active });
      setNotice(`${student.name}'s account is now ${student.is_active ? 'inactive' : 'active'}.`);
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const showStudentDetail = async (student) => {
    if (studentDetail?.student.id === student.id) {
      setStudentDetail(null);
      return;
    }
    setError('');
    setLoadingStudentId(student.id);
    try {
      const { data } = await api.get(`/admin/students/${student.id}`);
      setStudentDetail(data);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoadingStudentId('');
    }
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingAnnouncement) {
        await api.put(`/admin/announcements/${editingAnnouncement.id}`, announcementForm);
        setNotice('Announcement updated.');
      } else {
        await api.post('/admin/announcements', announcementForm);
        setNotice('Announcement published.');
      }
      setAnnouncementForm(emptyAnnouncement);
      setEditingAnnouncement(null);
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeAnnouncement = async (announcement) => {
    if (!window.confirm(`Delete “${announcement.title}”?`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/admin/announcements/${announcement.id}`);
      setNotice('Announcement deleted.');
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const saveMaterial = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!editingMaterial && !materialForm.file) {
      setError('Choose a PDF, DOC or DOCX file before uploading.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingMaterial) {
        await api.put(`/admin/materials/${editingMaterial.id}`, {
          title: materialForm.title,
          description: materialForm.description,
          category_id: materialForm.category_id,
          period_id: materialForm.period_id,
          age_group: materialForm.age_group,
        });
      } else {
        const body = new FormData();
        Object.entries(materialForm).forEach(([key, value]) => {
          if (value !== null && value !== '') body.append(key, value);
        });
        await api.post('/admin/materials', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      formElement.reset();
      setMaterialForm(emptyMaterial);
      setEditingMaterial(null);
      setNotice(editingMaterial ? 'Study material updated.' : 'Study material uploaded and is now available to students.');
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeMaterial = async (material) => {
    if (!window.confirm(`Delete “${material.title}” and its uploaded file?`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/admin/materials/${material.id}`);
      setNotice('Study material and its file were deleted.');
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const downloadMaterial = async (material) => {
    setError('');
    try {
      await downloadMaterialFile(material);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const saveQuiz = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...quizForm,
      duration_minutes: Number(quizForm.duration_minutes),
      total_marks: Number(quizForm.total_marks),
      questions: quizForm.questions.map((question) => ({
        ...question,
        correct_option: Number(question.correct_option),
      })),
    };
    try {
      if (editingQuiz) {
        await api.put(`/admin/quizzes/${editingQuiz.id}`, payload);
        setNotice('Quiz updated.');
      } else {
        await api.post('/admin/quizzes', payload);
        setNotice('Quiz created.');
      }
      setQuizForm(newQuizForm());
      setEditingQuiz(null);
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeQuiz = async (quiz) => {
    if (!window.confirm(`Archive “${quiz.title}”? Previous student results will be retained.`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/admin/quizzes/${quiz.id}`);
      setNotice('Quiz archived. Previous results have been retained.');
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const saveTest = async (event) => {
    event.preventDefault();
    const scheduledDate = new Date(testForm.scheduled_at);
    const closingDate = new Date(testForm.closes_at);
    if (Number.isNaN(scheduledDate.getTime()) || Number.isNaN(closingDate.getTime()) || closingDate <= scheduledDate) {
      setError('Choose a valid closing time later than the scheduled opening time.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...testForm,
      duration_minutes: Number(testForm.duration_minutes),
      total_marks: Number(testForm.total_marks),
      passing_marks: Number(testForm.passing_marks),
      scheduled_at: scheduledDate.toISOString(),
      closes_at: closingDate.toISOString(),
      questions: testForm.questions.map((question) => ({
        ...question,
        correct_option: Number(question.correct_option),
      })),
    };
    try {
      if (editingTest) {
        await api.put(`/admin/tests/${editingTest.id}`, payload);
        setNotice('Examination updated.');
      } else {
        await api.post('/admin/tests', payload);
        setNotice('Examination scheduled.');
      }
      setTestForm(newTestForm());
      setEditingTest(null);
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  const removeTest = async (test) => {
    if (!window.confirm(`Archive “${test.title}”? Previous student results will be retained.`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/admin/tests/${test.id}`);
      setNotice('Examination archived. Previous results have been retained.');
      await loadSection();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const showTestResults = async (test) => {
    if (testResults?.test.id === test.id) {
      setTestResults(null);
      return;
    }
    setError('');
    setTestResults({ test, loading: true, results: [] });
    try {
      const { data } = await api.get(`/admin/tests/${test.id}/results`);
      setTestResults({ test, loading: false, results: data.results || [] });
    } catch (requestError) {
      setTestResults(null);
      setError(getApiError(requestError));
    }
  };

  const sectionLabel = sections.find((item) => item.id === section)?.label || 'Overview';

  return <div className="admin-shell">
    <aside className={`admin-sidebar ${mobileNav ? 'admin-sidebar-open' : ''}`}>
      <div className="admin-side-brand"><span className="admin-seal"><BookOpen size={20} /></span><span><b>IKS</b><small>LEARNING PLATFORM</small></span></div>
      <div className="admin-side-label">ADMINISTRATION</div>
      <nav className="admin-side-nav" aria-label="Admin navigation">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'admin-nav-item active' : 'admin-nav-item'} onClick={() => changeSection(id)}>
          <Icon size={17} strokeWidth={1.6} /><span>{label}</span>{section === id && <ChevronRight className="admin-nav-arrow" size={15} />}
        </button>)}
      </nav>
      <div className="admin-side-bottom"><div className="admin-profile-mark">{(user?.name || 'A').slice(0, 1).toUpperCase()}</div><div className="admin-profile-text"><b>{user?.name || 'Administrator'}</b><small>Platform administrator</small></div><button className="admin-icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
    </aside>

    {mobileNav && <button className="admin-backdrop" aria-label="Close admin menu" onClick={() => setMobileNav(false)} />}
    <div className="admin-main">
      <header className="admin-topbar">
        <button className="admin-mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle admin menu"><span /><span /><span /></button>
        <div className="admin-breadcrumb">IKS <span>/</span> <b>{sectionLabel}</b></div>
        <div className="admin-top-actions"><span className="admin-secure"><ShieldCheck size={14} /> SECURE ADMIN</span><button className="admin-icon-button" onClick={refreshSection} title="Refresh data" aria-label="Refresh data"><RefreshCw size={16} /></button></div>
      </header>
      <main className="admin-content">
        <div className="admin-page-heading">
          <div><div className="eyebrow"><span /> {section === 'overview' ? 'THE LEARNING ARCHIVE' : 'PLATFORM MANAGEMENT'}</div><h1>{section === 'overview' ? <>Namaste, {user?.name?.split(' ')[0] || 'Administrator'}.</> : sectionLabel}</h1><p>{section === 'overview' ? 'A considered view of your growing IKS learning community.' : section === 'students' ? 'Review registered learners and manage their access.' : section === 'categories' ? 'Organise knowledge domains and their syllabus subcategories.' : section === 'timeline' ? 'Edit historical periods, subperiods, kingdoms, civilizations and their stories.' : section === 'materials' ? 'Upload and organise downloadable resources for learners.' : section === 'quizzes' ? 'Create age-appropriate quizzes with timed, multiple-choice questions.' : section === 'tests' ? 'Schedule examinations with time limits and passing marks.' : 'Share timely updates with learners across the platform.'}</p></div>
          {section !== 'overview' && <button className="admin-refresh-label" onClick={refreshSection}><RefreshCw size={14} /> Refresh</button>}
        </div>

        {error && <div className="admin-alert admin-alert-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
        {notice && <div className="admin-alert admin-alert-success" role="status"><Check size={15} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}

        {loading ? <div className="admin-loading"><RefreshCw className="spin" size={18} /> Gathering the records…</div> : <>
          {section === 'overview' && <Overview stats={stats} students={recentStudents} onStudents={() => changeSection('students')} />}
          {section === 'students' && <StudentManagement students={students} onToggle={setStudentActive} onProfile={showStudentDetail} detail={studentDetail} loadingStudentId={loadingStudentId} />}
          {section === 'timeline' && <TimelineManagement refreshToken={timelineRefreshToken} />}
          {section === 'categories' && <CategoryManagement
            categories={categories}
            periods={periods}
            form={categoryForm}
            setForm={setCategoryForm}
            editing={editingCategory}
            onEdit={(category) => { setEditingCategory(category); setCategoryForm({ name: category.name, description: category.description || '', parent_id: '', period_id: '' }); }}
            onCancel={() => { setEditingCategory(null); setCategoryForm(emptyCategory); }}
            onSubmit={saveCategory}
            onDelete={removeCategory}
            saving={saving}
          />}
          {section === 'materials' && <MaterialsManagement
            materials={materials}
            categories={categories}
            periods={periods}
            form={materialForm}
            setForm={setMaterialForm}
            editing={editingMaterial}
            onEdit={(material) => {
              setEditingMaterial(material);
              setMaterialForm({
                title: material.title,
                description: material.description || '',
                category_id: material.category_id,
                period_id: material.period_id,
                age_group: material.age_group,
                file: null,
              });
            }}
            onCancel={() => { setEditingMaterial(null); setMaterialForm(emptyMaterial); }}
            onSubmit={saveMaterial}
            onDelete={removeMaterial}
            onDownload={downloadMaterial}
            saving={saving}
          />}
          {section === 'quizzes' && <QuizManagement
            quizzes={quizzes}
            categories={categories}
            periods={periods}
            form={quizForm}
            setForm={setQuizForm}
            editing={editingQuiz}
            onEdit={async (quiz) => {
              setError('');
              setSaving(true);
              try {
                const { data } = await api.get(`/admin/quizzes/${quiz.id}`);
                setEditingQuiz(quiz);
                setQuizForm({
                  title: quiz.title,
                  description: quiz.description || '',
                  category_id: quiz.category_id,
                  period_id: quiz.period_id,
                  age_group: quiz.age_group,
                  duration_minutes: String(quiz.duration_minutes),
                  total_marks: String(quiz.total_marks),
                  questions: data.questions.map((question) => ({
                    prompt: question.prompt,
                    options: question.options,
                    correct_option: question.correct_option,
                    explanation: question.explanation,
                  })),
                });
              } catch (requestError) {
                setError(getApiError(requestError));
              } finally {
                setSaving(false);
              }
            }}
            onCancel={() => { setEditingQuiz(null); setQuizForm(newQuizForm()); }}
            onSubmit={saveQuiz}
            onDelete={removeQuiz}
            saving={saving}
          />}
          {section === 'tests' && <TestManagement
            tests={tests}
            categories={categories}
            periods={periods}
            form={testForm}
            setForm={setTestForm}
            editing={editingTest}
            onEdit={async (test) => {
              setError('');
              setSaving(true);
              try {
                const { data } = await api.get(`/admin/tests/${test.id}`);
                setEditingTest(test);
                setTestForm({
                  title: test.title,
                  description: test.description || '',
                  category_id: test.category_id,
                  period_id: test.period_id,
                  age_group: test.age_group,
                  duration_minutes: String(test.duration_minutes),
                  total_marks: String(test.total_marks),
                  passing_marks: String(test.passing_marks),
                  scheduled_at: toLocalDateTime(test.scheduled_at),
                  closes_at: toLocalDateTime(test.closes_at),
                  questions: data.questions.map((question) => ({
                    prompt: question.prompt,
                    options: question.options,
                    correct_option: question.correct_option,
                    explanation: question.explanation,
                  })),
                });
              } catch (requestError) {
                setError(getApiError(requestError));
              } finally {
                setSaving(false);
              }
            }}
            onCancel={() => { setEditingTest(null); setTestForm(newTestForm()); }}
            onSubmit={saveTest}
            onDelete={removeTest}
            resultData={testResults}
            onResults={showTestResults}
            saving={saving}
          />}
          {section === 'announcements' && <AnnouncementManagement
            announcements={announcements}
            form={announcementForm}
            setForm={setAnnouncementForm}
            editing={editingAnnouncement}
            onEdit={(item) => { setEditingAnnouncement(item); setAnnouncementForm({ title: item.title, body: item.body, is_published: item.is_published }); }}
            onCancel={() => { setEditingAnnouncement(null); setAnnouncementForm(emptyAnnouncement); }}
            onSubmit={saveAnnouncement}
            onDelete={removeAnnouncement}
            saving={saving}
          />}
        </>}
        <footer className="admin-content-foot">IKS · INDIAN KNOWLEDGE SYSTEMS <span>Knowledge is a lamp that lights the path.</span></footer>
      </main>
    </div>
  </div>;
}

function Overview({ stats, students, onStudents }) {
  return <>
    <div className="admin-metrics">
      <Metric icon={GraduationCap} label="REGISTERED STUDENTS" value={stats.students} note={`${stats.active_students} active accounts`} />
      <Metric icon={BookOpen} label="STUDY MATERIALS" value={stats.materials} note="Uploaded learning resources" />
      <Metric icon={Activity} label="QUIZZES & TESTS" value={stats.quizzes + stats.tests} note={`${stats.quizzes} quizzes · ${stats.tests} tests`} />
      <Metric icon={ArrowDownToLine} label="LEARNING ATTEMPTS" value={stats.attempts} note={stats.average_score == null ? 'No graded attempts yet' : `${stats.average_score}% average score`} />
    </div>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-panel-kicker">COMMUNITY</span><h2>Recently registered</h2></div><button className="admin-inline-link" onClick={onStudents}>All students <ChevronRight size={15} /></button></div>
      {students.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>LEARNER</th><th>EMAIL</th><th>JOINED</th><th>STATUS</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><b>{student.name}</b></td><td>{student.email}</td><td>{formatDate(student.created_at)}</td><td><span className={student.is_active ? 'admin-status status-active' : 'admin-status status-inactive'}>{student.is_active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="Your learning community starts here" detail="New student registrations will appear in this list." />}
    </section>
    <div className="admin-welcome-strip"><span className="admin-welcome-icon"><Bell size={18} /></span><p><b>A note for the curator</b><br />The figures above are live counts from your IKS database. Learning tools will populate the archive as you add content.</p></div>
  </>;
}

function StudentManagement({ students, onToggle, onProfile, detail, loadingStudentId }) {
  return <section className="admin-panel">
    <div className="admin-panel-heading"><div><span className="admin-panel-kicker">LEARNER DIRECTORY</span><h2>{students.length} registered {students.length === 1 ? 'student' : 'students'}</h2></div></div>
    {students.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>LEARNER</th><th>EMAIL</th><th>AGE GROUP</th><th>JOINED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><b>{student.name}</b></td><td>{student.email}</td><td>{student.age_group || '—'}</td><td>{formatDate(student.created_at)}</td><td><span className={student.is_active ? 'admin-status status-active' : 'admin-status status-inactive'}>{student.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="admin-row-action" onClick={() => onProfile(student)}>{loadingStudentId === student.id ? 'Loading…' : 'View profile'}</button> <button className="admin-row-action" onClick={() => onToggle(student)}>{student.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No student accounts yet" detail="Student accounts created through registration will appear here." />}
    {detail && <StudentPerformanceDetail detail={detail} />}
  </section>;
}

function StudentPerformanceDetail({ detail }) {
  const { student, performance, recent_results: results } = detail;
  return <section className="admin-student-detail">
    <div className="admin-panel-heading"><div><span className="admin-panel-kicker">LEARNER PROFILE</span><h2>{student.name}</h2></div><span className={student.is_active ? 'admin-status status-active' : 'admin-status status-inactive'}>{student.is_active ? 'Active account' : 'Inactive account'}</span></div>
    <div className="admin-student-meta"><span>{student.email}</span><span>Age group {student.age_group || '—'}</span><span>Joined {formatDate(student.created_at)}</span></div>
    <div className="admin-student-performance">
      <Metric icon={ClipboardCheck} label="SUBMITTED ATTEMPTS" value={performance.attempts} note="Quizzes and tests" />
      <Metric icon={BookOpen} label="QUIZZES COMPLETED" value={performance.quizzes_completed} note="Saved quiz attempts" />
      <Metric icon={GraduationCap} label="EXAMS PASSED" value={performance.tests_passed} note={`${performance.tests_completed} tests completed`} />
      <Metric icon={Activity} label="AVERAGE SCORE" value={performance.average_score == null ? '—' : `${performance.average_score}%`} note="Recent submitted assessments" />
    </div>
    <div className="admin-panel-heading"><div><span className="admin-panel-kicker">PERFORMANCE HISTORY</span><h2>Recent submissions</h2></div></div>
    {results.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ASSESSMENT</th><th>TYPE</th><th>SCORE</th><th>RESULT</th><th>SUBMITTED</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><td><b>{result.title}</b></td><td>{result.type === 'test' ? 'Examination' : 'Quiz'}</td><td>{result.score} / {result.total_marks}</td><td>{result.passed == null ? '—' : <span className={result.passed ? 'admin-status status-active' : 'admin-status status-inactive'}>{result.passed ? 'Passed' : 'Not passed'}</span>}</td><td>{formatDate(result.submitted_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={Activity} title="No assessment history yet" detail="Student results will appear here after a quiz or examination is submitted." />}
  </section>;
}

function CategoryManagement({ categories, periods, form, setForm, editing, onEdit, onCancel, onSubmit, onDelete, saving }) {
  const categoryName = (id) => categories.find((item) => item.id === id)?.name || 'Main domain';
  const periodName = (id) => periods.find((item) => item.id === id)?.name;
  return <div className="admin-management-grid">
    <section className="admin-panel admin-form-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editing ? 'EDIT ENTRY' : 'ADD TO THE SYLLABUS'}</span><h2>{editing ? 'Edit category' : 'New category'}</h2></div></div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label>Category name<input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Indian Mathematics" /></label>
        <label>Description<textarea maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short introduction to this area of knowledge (optional)" /></label>
        {!editing && <>
          <label>Parent domain <select value={form.parent_id} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}><option value="">Create a main domain</option>{categories.filter((item) => !item.parent_id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Historical period <select value={form.period_id} onChange={(event) => setForm({ ...form, period_id: event.target.value })}><option value="">Not period-specific</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.name}</option>)}</select></label>
        </>}
        <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <>{editing ? 'Save changes' : <><Plus size={15} /> Create category</>}</>}</button>{editing && <button type="button" className="admin-cancel-button" onClick={onCancel}>Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">KNOWLEDGE MAP</span><h2>{categories.length} categories</h2></div></div>
      {categories.length ? <div className="admin-category-list">{categories.map((category) => <article className="admin-category-row" key={category.id}><div className="admin-category-symbol"><BookOpen size={16} /></div><div className="admin-category-copy"><b>{category.name}</b><small>{category.parent_id ? `Subcategory of ${categoryName(category.parent_id)}` : 'Main knowledge domain'}{periodName(category.period_id) ? ` · ${periodName(category.period_id)}` : ''}</small>{category.description && <p>{category.description}</p>}</div><div className="admin-row-actions"><button aria-label={`Edit ${category.name}`} title="Edit category" onClick={() => onEdit(category)}><Pencil size={14} /></button><button aria-label={`Delete ${category.name}`} title="Delete category" onClick={() => onDelete(category)}><X size={15} /></button></div></article>)}</div> : <EmptyState icon={BookOpen} title="No categories found" detail="Add the first knowledge domain using the form." />}
    </section>
  </div>;
}

function AnnouncementManagement({ announcements, form, setForm, editing, onEdit, onCancel, onSubmit, onDelete, saving }) {
  return <div className="admin-management-grid announcement-grid">
    <section className="admin-panel admin-form-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editing ? 'EDIT MESSAGE' : 'SHARE WITH LEARNERS'}</span><h2>{editing ? 'Edit announcement' : 'New announcement'}</h2></div></div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label>Title<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="A clear, helpful headline" /></label>
        <label>Message<textarea required maxLength={4000} rows={6} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write an update for your student community" /></label>
        <label className="admin-checkbox-label"><input type="checkbox" checked={form.is_published} onChange={(event) => setForm({ ...form, is_published: event.target.checked })} /> Publish to student dashboards</label>
        <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <><Plus size={15} /> {editing ? 'Save changes' : 'Publish announcement'}</>}</button>{editing && <button type="button" className="admin-cancel-button" onClick={onCancel}>Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">NOTICE BOARD</span><h2>{announcements.length} announcements</h2></div></div>
      {announcements.length ? <div className="admin-announcement-list">{announcements.map((item) => <article className="admin-announcement-card" key={item.id}><div className="admin-announcement-meta"><span className={item.is_published ? 'admin-status status-active' : 'admin-status status-draft'}>{item.is_published ? 'Published' : 'Draft'}</span><span>{formatDate(item.created_at)}</span></div><h3>{item.title}</h3><p>{item.body}</p><div className="admin-announcement-actions"><button onClick={() => onEdit(item)}><Pencil size={13} /> Edit</button><button onClick={() => onDelete(item)}><X size={14} /> Delete</button></div></article>)}</div> : <EmptyState icon={Megaphone} title="The notice board is quiet" detail="Create an announcement to share it with students." />}
    </section>
  </div>;
}

function MaterialsManagement({ materials, categories, periods, form, setForm, editing, onEdit, onCancel, onSubmit, onDelete, onDownload, saving }) {
  return <div className="admin-management-grid">
    <section className="admin-panel admin-form-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editing ? 'UPDATE LIBRARY ENTRY' : 'GROW THE LIBRARY'}</span><h2>{editing ? 'Edit study material' : 'Upload study material'}</h2></div></div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label>Material title<input required maxLength={150} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. An introduction to Vedic astronomy" /></label>
        <label>Description<textarea maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short overview for learners (optional)" /></label>
        <label>Knowledge category<select required value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label>Historical period<select required value={form.period_id} onChange={(event) => setForm({ ...form, period_id: event.target.value })}><option value="">Choose a period</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.name}</option>)}</select></label>
        <div className="admin-material-form-row">
          <label>Age group<select required value={form.age_group} onChange={(event) => setForm({ ...form, age_group: event.target.value })}><option value="10-13">10–13</option><option value="14-16">14–16</option><option value="17-19">17–19</option><option value="20+">20+</option></select></label>
          <label className="admin-file-field">Document<input required={!editing} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /><small>{editing ? `Current file: ${editing.file_name} (file replacement is not available)` : 'PDF, DOC or DOCX · 16 MB maximum'}</small></label>
        </div>
        <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <>{editing ? 'Save changes' : <><Plus size={15} /> Upload material</>}</>}</button>{editing && <button type="button" className="admin-cancel-button" onClick={onCancel}>Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">THE STUDY LIBRARY</span><h2>{materials.length} materials</h2></div></div>
      {materials.length ? <div className="admin-material-list">{materials.map((material) => <article className="admin-material-row" key={material.id}><span className="admin-material-icon"><FileText size={17} /></span><div className="admin-material-copy"><b>{material.title}</b><small>{material.category_name} · {material.period_name} · Ages {material.age_group}</small><small>{material.file_name} · {formatBytes(material.file_size)}</small></div><div className="admin-row-actions"><button title="Download file" aria-label={`Download ${material.title}`} onClick={() => onDownload(material)}><ArrowDownToLine size={15} /></button><button title="Edit material details" aria-label={`Edit ${material.title}`} onClick={() => onEdit(material)}><Pencil size={14} /></button><button title="Delete material" aria-label={`Delete ${material.title}`} onClick={() => onDelete(material)}><X size={15} /></button></div></article>)}</div> : <EmptyState icon={FileText} title="The study library is waiting" detail="Upload a resource to make it available for learners." />}
    </section>
  </div>;
}

function QuizManagement({ quizzes, categories, periods, form, setForm, editing, onEdit, onCancel, onSubmit, onDelete, saving }) {
  return <div className="admin-management-grid">
    <section className="admin-panel admin-form-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editing ? 'EDIT ASSESSMENT' : 'BUILD AN ASSESSMENT'}</span><h2>{editing ? 'Edit quiz' : 'New quiz'}</h2></div></div>
      <form className="admin-form admin-quiz-form" onSubmit={onSubmit}>
        <label>Quiz title<input required maxLength={150} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="A short, clear quiz title" /></label>
        <label>Description<textarea maxLength={2000} rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What will learners explore?" /></label>
        <div className="admin-material-form-row">
          <label>Knowledge category<select required value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Choose category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>Historical period<select required value={form.period_id} onChange={(event) => setForm({ ...form, period_id: event.target.value })}><option value="">Choose period</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.name}</option>)}</select></label>
        </div>
        <div className="admin-quiz-config">
          <label>Age group<select value={form.age_group} onChange={(event) => setForm({ ...form, age_group: event.target.value })}><option value="10-13">10–13</option><option value="14-16">14–16</option><option value="17-19">17–19</option><option value="20+">20+</option></select></label>
          <label>Minutes<input type="number" min="1" max="240" required value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })} /></label>
          <label>Total marks<input type="number" min="1" max="1000" required value={form.total_marks} onChange={(event) => setForm({ ...form, total_marks: event.target.value })} /></label>
        </div>
        <QuestionEditor form={form} setForm={setForm} />
        <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <>{editing ? 'Save changes' : 'Create quiz'}</>}</button>{editing && <button type="button" className="admin-cancel-button" onClick={onCancel}>Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">ASSESSMENT LIBRARY</span><h2>{quizzes.length} quizzes</h2></div></div>
      {quizzes.length ? <div className="admin-announcement-list">{quizzes.map((quiz) => <article className="admin-announcement-card" key={quiz.id}><div className="admin-announcement-meta"><span className={quiz.is_active ? 'admin-status status-active' : 'admin-status status-draft'}>{quiz.is_active ? 'Available' : 'Archived'}</span><span>{quiz.age_group} · {quiz.duration_minutes} min</span></div><h3>{quiz.title}</h3><p>{quiz.category_name} · {quiz.period_name} · {quiz.question_count} questions · {quiz.total_marks} marks</p><div className="admin-announcement-actions">{quiz.is_active && <button onClick={() => onEdit(quiz)}><Pencil size={13} /> Edit</button>}{quiz.is_active && <button onClick={() => onDelete(quiz)}><X size={14} /> Archive</button>}</div></article>)}</div> : <EmptyState icon={ClipboardCheck} title="No quizzes yet" detail="Create a quiz with multiple-choice questions for your learners." />}
    </section>
  </div>;
}

function TestManagement({ tests, categories, periods, form, setForm, editing, onEdit, onCancel, onSubmit, onDelete, resultData, onResults, saving }) {
  return <div className="admin-management-grid">
    <section className="admin-panel admin-form-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">{editing ? 'EDIT EXAMINATION' : 'SCHEDULE AN EXAMINATION'}</span><h2>{editing ? 'Edit examination' : 'New examination'}</h2></div></div>
      <form className="admin-form admin-quiz-form" onSubmit={onSubmit}>
        <label>Examination title<input required maxLength={150} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Ancient India — Unit I" /></label>
        <label>Description<textarea maxLength={2000} rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What syllabus does this examination cover?" /></label>
        <div className="admin-material-form-row">
          <label>Knowledge category<select required value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Choose category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label>Historical period<select required value={form.period_id} onChange={(event) => setForm({ ...form, period_id: event.target.value })}><option value="">Choose period</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.name}</option>)}</select></label>
        </div>
        <div className="admin-quiz-config">
          <label>Age group<select value={form.age_group} onChange={(event) => setForm({ ...form, age_group: event.target.value })}><option value="10-13">10–13</option><option value="14-16">14–16</option><option value="17-19">17–19</option><option value="20+">20+</option></select></label>
          <label>Minutes<input type="number" min="1" max="240" required value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })} /></label>
          <label>Total marks<input type="number" min="1" max="1000" required value={form.total_marks} onChange={(event) => setForm({ ...form, total_marks: event.target.value })} /></label>
          <label>Passing marks<input type="number" min="0" max={form.total_marks} required value={form.passing_marks} onChange={(event) => setForm({ ...form, passing_marks: event.target.value })} /></label>
          <label>Opens at<input type="datetime-local" required value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })} /></label>
          <label>Closes at<input type="datetime-local" required min={form.scheduled_at || undefined} value={form.closes_at} onChange={(event) => setForm({ ...form, closes_at: event.target.value })} /></label>
        </div>
        <QuestionEditor form={form} setForm={setForm} />
        <div className="admin-form-actions"><button className="button" disabled={saving}>{saving ? 'Saving…' : <>{editing ? 'Save changes' : 'Schedule examination'}</>}</button>{editing && <button type="button" className="admin-cancel-button" onClick={onCancel}>Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">EXAMINATION SCHEDULE</span><h2>{tests.length} examinations</h2></div></div>
      {tests.length ? <div className="admin-announcement-list">{tests.map((test) => <article className="admin-announcement-card" key={test.id}><div className="admin-announcement-meta"><span className={test.is_active ? 'admin-status status-active' : 'admin-status status-draft'}>{test.is_active ? (test.is_available ? 'Open now' : 'Scheduled') : 'Archived'}</span><span>{test.age_group} · {test.duration_minutes} min</span></div><h3>{test.title}</h3><p>{test.category_name} · {test.period_name} · {test.question_count} questions · Pass {test.passing_marks}/{test.total_marks}</p><small className="admin-test-dates">{formatDate(test.scheduled_at)} — {formatDate(test.closes_at)}</small><div className="admin-announcement-actions"><button onClick={() => onResults(test)}><Users size={13} /> Results</button>{test.is_active && <button onClick={() => onEdit(test)}><Pencil size={13} /> Edit</button>}{test.is_active && <button onClick={() => onDelete(test)}><X size={14} /> Archive</button>}</div></article>)}</div> : <EmptyState icon={ClipboardCheck} title="No examinations scheduled" detail="Create an examination with a schedule and passing mark." />}
      {resultData && <section className="admin-test-results"><div className="admin-panel-heading"><div><span className="admin-panel-kicker">SUBMISSIONS</span><h2>{resultData.test.title} · {resultData.results.length} results</h2></div></div>{resultData.loading ? <div className="admin-loading"><RefreshCw className="spin" size={16} /> Loading results…</div> : resultData.results.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>STUDENT</th><th>SCORE</th><th>RESULT</th><th>SUBMITTED</th></tr></thead><tbody>{resultData.results.map((result) => <tr key={result.attempt_id}><td><b>{result.student_name}</b><br /><small>{result.student_email}</small></td><td>{result.score} / {result.total_marks}</td><td><span className={result.passed ? 'admin-status status-active' : 'admin-status status-inactive'}>{result.passed ? 'Passed' : 'Not passed'}{result.timed_out ? ' · Timed out' : ''}</span></td><td>{formatDate(result.submitted_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={Users} title="No submissions yet" detail="Submitted examination results will appear here." />}</section>}
    </section>
  </div>;
}

function QuestionEditor({ form, setForm }) {
  const updateQuestion = (index, update) => setForm({
    ...form,
    questions: form.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...update } : question),
  });
  const updateOption = (questionIndex, optionIndex, value) => {
    const options = [...form.questions[questionIndex].options];
    options[optionIndex] = value;
    updateQuestion(questionIndex, { options });
  };
  return <>
    <div className="admin-question-editor-heading"><b>Questions</b><span>{form.questions.length} / 50</span></div>
    {form.questions.map((question, index) => <fieldset className="admin-question-editor" key={index}>
      <legend>QUESTION {String(index + 1).padStart(2, '0')}</legend>
      {form.questions.length > 1 && <button className="admin-question-remove" type="button" aria-label={`Remove question ${index + 1}`} onClick={() => setForm({ ...form, questions: form.questions.filter((_, questionIndex) => questionIndex !== index) })}><X size={14} /></button>}
      <label>Prompt<textarea required maxLength={1000} rows={2} value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="Write the question" /></label>
      <div className="admin-option-grid">{question.options.map((option, optionIndex) => <label key={optionIndex}>Option {optionIndex + 1}<input required maxLength={300} value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} placeholder={`Answer ${optionIndex + 1}`} /></label>)}</div>
      <label>Correct answer<select value={question.correct_option} onChange={(event) => updateQuestion(index, { correct_option: Number(event.target.value) })}>{question.options.map((_, optionIndex) => <option value={optionIndex} key={optionIndex}>Option {optionIndex + 1}</option>)}</select></label>
      <label>Explanation<textarea maxLength={2000} rows={2} value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} placeholder="Shown after a learner submits (optional)" /></label>
    </fieldset>)}
    <button type="button" className="admin-add-question" disabled={form.questions.length >= 50} onClick={() => setForm({ ...form, questions: [...form.questions, { prompt: '', options: ['', '', '', ''], correct_option: 0, explanation: '' }] })}><Plus size={14} /> Add a question</button>
  </>;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmptyState({ icon: Icon, title, detail }) {
  return <div className="admin-empty"><span><Icon size={20} /></span><b>{title}</b><p>{detail}</p></div>;
}
