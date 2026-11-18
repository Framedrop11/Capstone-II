import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, Card } from '../../design/components';
import { createAdminApi, type AdminApi } from '../../features/admin/api';
import { useAuthSession } from '../../shared/auth/useAuthSession';

type User = Awaited<ReturnType<AdminApi['users']>>['items'][number];
type AuditFilters = {
  patientId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
};
type Role = User['role'];
const roles: Role[] = ['patient', 'doctor', 'admin'];
const friendly = (error: unknown) =>
  (error as { message?: string })?.message ?? 'Something went wrong. Please try again.';
const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not promoted';

export function AdminWorkspace() {
  const { session, snapshot } = useAuthSession();
  const api = useMemo(() => createAdminApi(session), [session]);
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [filters, setFilters] = useState<AuditFilters>({});
  const [draftFilters, setDraftFilters] = useState({
    patientId: '',
    actorId: '',
    action: '',
    from: '',
    to: '',
  });
  const [feedback, setFeedback] = useState('');
  const users = useInfiniteQuery({
    queryKey: ['admin', 'users'],
    queryFn: ({ pageParam }) => api.users(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const audit = useInfiniteQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: ({ pageParam }) => api.audit(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const models = useInfiniteQuery({
    queryKey: ['admin', 'models'],
    queryFn: ({ pageParam }) => api.modelVersions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const health = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: api.health,
    refetchInterval: 15_000,
  });
  const canary = useQuery({
    queryKey: ['admin', 'model-canary'],
    queryFn: api.modelCanary,
    refetchInterval: 5_000,
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => api.updateRole(userId, role),
    onSuccess: async () => {
      setFeedback('User role updated.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => setFeedback(friendly(error)),
  });
  const modelAction = useMutation({
    mutationFn: ({ action, version }: { action: 'promote' | 'rollback'; version: string }) =>
      action === 'promote' ? api.promote(version) : api.rollback(version),
    onSuccess: async (result) => {
      setFeedback(`Model ${result.version} is now ${result.status}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'models'] });
    },
    onError: (error) => setFeedback(friendly(error)),
  });
  const allUsers = users.data?.pages.flatMap((page) => page.items) ?? [];
  const shownUsers = allUsers.filter((user) =>
    `${user.name} ${user.email} ${user.userId}`
      .toLowerCase()
      .includes(userSearch.trim().toLowerCase()),
  );
  const allAudit = audit.data?.pages.flatMap((page) => page.items) ?? [];
  const allModels = models.data?.pages.flatMap((page) => page.items) ?? [];
  const currentUserId = snapshot.userId;
  const auditScrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual deliberately opts this component out of React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const auditRows = useVirtualizer({
    count: allAudit.length,
    getScrollElement: () => auditScrollRef.current,
    estimateSize: () => 60,
    overscan: 8,
    initialRect: { width: 960, height: 480 },
  });
  const virtualizedAudit = allAudit.length > 50;
  const measuredAuditRows = auditRows.getVirtualItems();
  const visibleAuditRows = virtualizedAudit
    ? measuredAuditRows.length > 0
      ? measuredAuditRows
      : allAudit.slice(0, 12).map((entry, index) => ({
          index,
          key: entry.auditLogId,
          lane: 0,
          start: index * 60,
          end: (index + 1) * 60,
          size: 60,
        }))
    : [];

  function searchAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = draftFilters.from ? new Date(draftFilters.from).toISOString() : undefined;
    const to = draftFilters.to ? new Date(draftFilters.to).toISOString() : undefined;
    setFilters({
      ...(draftFilters.patientId.trim() ? { patientId: draftFilters.patientId.trim() } : {}),
      ...(draftFilters.actorId.trim() ? { actorId: draftFilters.actorId.trim() } : {}),
      ...(draftFilters.action.trim() ? { action: draftFilters.action.trim() } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
  }

  function runModelAction(action: 'promote' | 'rollback', version: string) {
    const verb = action === 'promote' ? 'promote' : 'roll back to';
    if (window.confirm(`Are you sure you want to ${verb} model ${version}?`)) {
      setFeedback('');
      modelAction.mutate({ action, version });
    }
  }

  return (
    <main className="cl-workspace cl-admin">
      <header className="cl-workspace-header">
        <div>
          <p className="cl-eyebrow">CareLens administration</p>
          <h1>Operations dashboard</h1>
          <p>Manage access and review system activity.</p>
        </div>
        <Button variant="quiet" onClick={() => void session.signOut()}>
          Sign out
        </Button>
      </header>
      {feedback && (
        <p role="status" className="cl-admin-feedback">
          {feedback}
        </p>
      )}
      <section aria-labelledby="admin-health-title">
        <Card className="cl-admin-health">
          <div>
            <h2 id="admin-health-title">System health</h2>
            <p>Dependency readiness, refreshed every 15 seconds.</p>
          </div>
          {health.isSuccess ? (
            <>
              <strong className={`cl-health-status cl-health-status--${health.data.status}`}>
                {health.data.status === 'ready' ? 'Ready' : 'Not ready'}
              </strong>
              <dl className="cl-health-grid">
                <div>
                  <dt>Database</dt>
                  <dd>{health.data.database ? 'Available' : 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>Queue</dt>
                  <dd>{health.data.queue ? 'Available' : 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>Cache</dt>
                  <dd>
                    {health.data.cache
                      ? health.data.degraded
                        ? 'Degraded'
                        : 'Available'
                      : 'Unavailable'}
                  </dd>
                </div>
              </dl>
            </>
          ) : health.isLoading ? (
            <p role="status">Checking system health…</p>
          ) : health.isError ? (
            <div role="alert">
              <p>System health is unavailable.</p>
              <Button variant="secondary" onClick={() => void health.refetch()}>
                Try again
              </Button>
            </div>
          ) : null}
          <a
            href={import.meta.env.VITE_GRAFANA_URL ?? 'http://localhost:3001'}
            target="_blank"
            rel="noreferrer"
          >
            Open Grafana dashboard
          </a>
        </Card>
      </section>
      <div className="cl-admin-grid">
        <section aria-labelledby="admin-users-title">
          <Card>
            <h2 id="admin-users-title">Users and roles</h2>
            <label className="cl-field">
              Search loaded users
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Name, email or ID"
              />
            </label>
            {users.isLoading ? (
              <p role="status">Loading users…</p>
            ) : users.isError ? (
              <div role="alert">
                <p>We could not load users.</p>
                <Button variant="secondary" onClick={() => void users.refetch()}>
                  Try again
                </Button>
              </div>
            ) : shownUsers.length === 0 ? (
              <p>No users match this search.</p>
            ) : (
              <div ref={auditScrollRef} className="cl-admin-table-wrap cl-admin-audit-scroll">
                <table className="cl-admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownUsers.map((user) => (
                      <tr key={user.userId}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <label className="cl-sr-only" htmlFor={`role-${user.userId}`}>
                            Role for {user.name}
                          </label>
                          <select
                            id={`role-${user.userId}`}
                            value={user.role}
                            disabled={changeRole.isPending || user.userId === currentUserId}
                            onChange={(event) =>
                              changeRole.mutate({
                                userId: user.userId,
                                role: event.target.value as Role,
                              })
                            }
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          {user.userId === currentUserId && <small>Your own role is locked.</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {users.hasNextPage && (
              <Button
                variant="secondary"
                disabled={users.isFetchingNextPage}
                onClick={() => void users.fetchNextPage()}
              >
                {users.isFetchingNextPage ? 'Loading…' : 'Load more users'}
              </Button>
            )}
          </Card>
        </section>
        <section aria-labelledby="admin-audit-title">
          <Card>
            <h2 id="admin-audit-title">Audit search</h2>
            <form className="cl-admin-filter-form" onSubmit={searchAudit}>
              <label className="cl-field">
                Patient ID
                <input
                  value={draftFilters.patientId}
                  onChange={(event) =>
                    setDraftFilters({ ...draftFilters, patientId: event.target.value })
                  }
                />
              </label>
              <label className="cl-field">
                Actor ID
                <input
                  value={draftFilters.actorId}
                  onChange={(event) =>
                    setDraftFilters({ ...draftFilters, actorId: event.target.value })
                  }
                />
              </label>
              <label className="cl-field">
                Action
                <input
                  value={draftFilters.action}
                  onChange={(event) =>
                    setDraftFilters({ ...draftFilters, action: event.target.value })
                  }
                />
              </label>
              <label className="cl-field">
                From
                <input
                  type="datetime-local"
                  value={draftFilters.from}
                  onChange={(event) =>
                    setDraftFilters({ ...draftFilters, from: event.target.value })
                  }
                />
              </label>
              <label className="cl-field">
                To
                <input
                  type="datetime-local"
                  value={draftFilters.to}
                  onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
                />
              </label>
              <Button type="submit">Search audit</Button>
            </form>
            {audit.isLoading ? (
              <p role="status">Loading audit records…</p>
            ) : audit.isError ? (
              <div role="alert">
                <p>We could not load audit records.</p>
                <Button variant="secondary" onClick={() => void audit.refetch()}>
                  Try again
                </Button>
              </div>
            ) : allAudit.length === 0 ? (
              <p>No audit records match these filters.</p>
            ) : (
              <div className="cl-admin-table-wrap">
                <table className="cl-admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Patient</th>
                      <th>Actor</th>
                      <th>Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {virtualizedAudit && visibleAuditRows.length > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={5}
                          style={{
                            height: visibleAuditRows[0]!.start,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                    {virtualizedAudit
                      ? visibleAuditRows.map((virtualRow) => {
                          const entry = allAudit[virtualRow.index]!;
                          return (
                            <tr
                              key={entry.auditLogId}
                              data-index={virtualRow.index}
                              ref={auditRows.measureElement}
                            >
                              <td>{formatDate(entry.timestamp)}</td>
                              <td>{entry.action}</td>
                              <td>{entry.patientId}</td>
                              <td>{entry.actorId}</td>
                              <td>{entry.modelVersion ?? '—'}</td>
                            </tr>
                          );
                        })
                      : allAudit.map((entry) => (
                          <tr key={entry.auditLogId}>
                            <td>{formatDate(entry.timestamp)}</td>
                            <td>{entry.action}</td>
                            <td>{entry.patientId}</td>
                            <td>{entry.actorId}</td>
                            <td>{entry.modelVersion ?? '—'}</td>
                          </tr>
                        ))}
                    {virtualizedAudit && visibleAuditRows.length > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={5}
                          style={{
                            height: auditRows.getTotalSize() - visibleAuditRows.at(-1)!.end,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {audit.hasNextPage && (
              <Button
                variant="secondary"
                disabled={audit.isFetchingNextPage}
                onClick={() => void audit.fetchNextPage()}
              >
                {audit.isFetchingNextPage ? 'Loading…' : 'Load more audit records'}
              </Button>
            )}
          </Card>
        </section>
        <section aria-labelledby="admin-models-title">
          <Card>
            <h2 id="admin-models-title">Model versions</h2>
            <section aria-labelledby="admin-canary-title" className="cl-admin-canary">
              <h3 id="admin-canary-title">Automatic canary controller</h3>
              {canary.data?.canaryController ? (
                <>
                  <p>
                    Candidate: {canary.data.canaryController.candidateVersion ?? 'None'} · Traffic:{' '}
                    {canary.data.canaryController.trafficPercent}% · Samples in stage:{' '}
                    {canary.data.canaryController.samplesInStage}
                  </p>
                  <p>Controller {canary.data.canaryController.enabled ? 'active' : 'idle'}.</p>
                  {canary.data.canaryController.history.slice(-5).reverse().map((decision, index) => (
                    <p key={`${decision.timestamp}-${index}`}>
                      {decision.action} → {decision.trafficPercent}% ({decision.reason})
                    </p>
                  ))}
                </>
              ) : (
                <p>{canary.data?.status === 'unavailable' ? 'ML service unavailable.' : 'Loading canary status…'}</p>
              )}
            </section>
            {models.isLoading ? (
              <p role="status">Loading model versions…</p>
            ) : models.isError ? (
              <div role="alert">
                <p>We could not load model versions.</p>
                <Button variant="secondary" onClick={() => void models.refetch()}>
                  Try again
                </Button>
              </div>
            ) : allModels.length === 0 ? (
              <p>No model versions are registered.</p>
            ) : (
              <div className="cl-admin-models">
                {allModels.map((model) => {
                  const eligible = model.testResults['promotionEligible'] === true;
                  return (
                    <article key={model.version} className="cl-admin-model">
                      <div>
                        <h3>{model.version}</h3>
                        <span className="cl-model-status">{model.status}</span>
                      </div>
                      <div className="cl-canary-share">
                        <label htmlFor={`canary-${model.version}`}>
                          Canary traffic share: {model.canaryTrafficPercent}%
                        </label>
                        <progress
                          id={`canary-${model.version}`}
                          max={100}
                          value={model.canaryTrafficPercent}
                        />
                      </div>
                      <p>Promotion gate: {eligible ? 'Passed' : 'Not passed'}</p>
                      <p>Promoted: {formatDate(model.promotedAt)}</p>
                      <p className="cl-admin-artifact">Artifact: {model.artifactUri}</p>
                      <div className="cl-admin-model-actions">
                        {model.status === 'candidate' && (
                          <Button
                            disabled={!eligible || modelAction.isPending}
                            onClick={() => runModelAction('promote', model.version)}
                          >
                            Promote
                          </Button>
                        )}
                        {model.status === 'retired' && (
                          <Button
                            variant="secondary"
                            disabled={modelAction.isPending}
                            onClick={() => runModelAction('rollback', model.version)}
                          >
                            Roll back
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {models.hasNextPage && (
              <Button
                variant="secondary"
                disabled={models.isFetchingNextPage}
                onClick={() => void models.fetchNextPage()}
              >
                {models.isFetchingNextPage ? 'Loading…' : 'Load more versions'}
              </Button>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
