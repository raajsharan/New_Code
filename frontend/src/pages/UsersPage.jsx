import React, { useState, useEffect, useCallback } from 'react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Save, X, UserPlus, Star, KeyRound } from 'lucide-react';

const roleBadge = (role) => ({
  superadmin: 'bg-amber-100 text-amber-700',
  admin:      'bg-red-100 text-red-700',
  readwrite:  'bg-blue-100 text-blue-700',
  readonly:   'bg-gray-100 text-gray-600',
}[role] || 'bg-gray-100 text-gray-600');

export default function UsersPage() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', full_name: '', role: 'readonly' });
  const [creating, setCreating] = useState(false);
  const [resetUserId, setResetUserId] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAll();
      setUsers(res.data);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleEditSave = async (id) => {
    try {
      await usersAPI.update(id, editData);
      toast.success('User updated');
      setEditId(null);
      fetchUsers();
    } catch { toast.error('Update failed'); }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await usersAPI.delete(user.id);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
  };

  const handleResetPassword = async () => {
    if (!resetPw || resetPw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setResetting(true);
    try {
      await usersAPI.resetPassword(resetUserId, { new_password: resetPw });
      toast.success('Password reset successfully');
      setResetUserId(null);
      setResetPw('');
    } catch (err) { toast.error(err.response?.data?.error || 'Reset failed'); }
    finally { setResetting(false); }
  };

    const handleCreate = async (e) => {
    e.preventDefault();
    if (!newUser.username || !newUser.email || !newUser.password) {
      toast.error('Fill in all required fields'); return;
    }
    setCreating(true);
    try {
      await usersAPI.create(newUser);
      toast.success('User created');
      setNewUser({ username: '', email: '', password: '', full_name: '', role: 'readonly' });
      setShowAddForm(false);
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.error || 'Create failed'); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
          <p className="text-sm text-gray-500">{users.length} registered users</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {/* Add User Form */}
      {showAddForm && (
        <div className="card mb-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Plus size={15} /> Create New User</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input className="input-field" placeholder="John Doe" value={newUser.full_name}
                onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username <span className="text-red-500">*</span></label>
              <input className="input-field" placeholder="johndoe" value={newUser.username} required
                onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" className="input-field" placeholder="john@company.com" value={newUser.email} required
                onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password <span className="text-red-500">*</span></label>
              <input type="password" className="input-field" placeholder="Min 6 chars" value={newUser.password} required minLength={6}
                onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select className="input-field" value={newUser.role}
                onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                {(isSuperAdmin ? ['admin','readwrite','readonly'] : ['readwrite','readonly']).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 justify-center">
                {creating ? 'Creating…' : 'Create User'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary px-3">
                <X size={14} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-th">Username</th>
              <th className="table-th">Full Name</th>
              <th className="table-th">Email</th>
              <th className="table-th">Role</th>
              <th className="table-th">Status</th>
              <th className="table-th">Created</th>
              <th className="table-th">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array(7).fill(0).map((_, j) => <td key={j} className="table-td"><div className="h-4 bg-gray-100 rounded" /></td>)}
                </tr>
              ))
            ) : users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="table-td font-mono text-xs font-medium">{user.username}</td>
                <td className="table-td">
                  {editId === user.id ? (
                    <input className="input-field py-1 text-xs" value={editData.full_name || ''}
                      onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))} />
                  ) : user.full_name}
                </td>
                <td className="table-td text-gray-500 text-xs">{user.email}</td>
                <td className="table-td">
                  {editId === user.id ? (
                    <select className="input-field py-1 text-xs" value={editData.role || user.role}
                      onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}>
                      {(isSuperAdmin ? ['admin','readwrite','readonly'] : ['readwrite','readonly']).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(user.role)}`}>{user.role}</span>
                  )}
                </td>
                <td className="table-td">
                  {editId === user.id ? (
                    <select className="input-field py-1 text-xs" value={String(editData.is_active ?? user.is_active)}
                      onChange={e => setEditData(p => ({ ...p, is_active: e.target.value === 'true' }))}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  ) : (
                    <span className={`text-xs font-medium ${user.is_active ? 'text-green-600' : 'text-red-500'}`}>
                      {user.is_active ? '● Active' : '○ Inactive'}
                    </span>
                  )}
                </td>
                <td className="table-td text-xs text-gray-400">{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="table-td">
                  <div className="flex items-center gap-1">
                    {editId === user.id ? (
                      <>
                        <button onClick={() => handleEditSave(user.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded"><Save size={13} /></button>
                        <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={13} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditId(user.id); setEditData({ role: user.role, is_active: user.is_active, full_name: user.full_name }); }}
                          className="p-1.5 text-blue-500 hover:bg-blue-100 rounded" title="Edit"><Edit2 size={13} /></button>
                        <button onClick={() => { setResetUserId(user.id); setResetPw(''); }}
                          className="p-1.5 text-amber-500 hover:bg-amber-100 rounded" title="Reset Password"><KeyRound size={13} /></button>
                        <button onClick={() => handleDelete(user)}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded" title="Delete"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No users found</div>
        )}
      </div>

      {/* ── Reset Password Modal ── */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <KeyRound size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Reset Password</h3>
                <p className="text-xs text-gray-500">{users.find(u => u.id === resetUserId)?.username}</p>
              </div>
              <button onClick={() => { setResetUserId(null); setResetPw(''); }}
                className="ml-auto p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X size={15}/></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="Minimum 6 characters"
                name="reset_new_password"
                autoComplete="new-password"
                value={resetPw}
                onChange={e => setResetPw(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">User must use this password on next login</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleResetPassword} disabled={resetting || !resetPw}
                className="btn-primary flex-1 justify-center">
                <KeyRound size={14}/> {resetting ? 'Resetting…' : 'Reset Password'}
              </button>
              <button onClick={() => { setResetUserId(null); setResetPw(''); }}
                className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
