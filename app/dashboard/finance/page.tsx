import { getDb } from "@/db";
import { requireWorkspacePermission } from "@/lib/auth";
import { listWorkspaceMembers } from "@/lib/data";
import {
  listFinancialTransactions,
  listFundingPools,
  listParticipantRoles,
} from "@/lib/finance";
import { FinanceSetup } from "./finance-setup";

const ROLE_COPY = [
  {
    role: "Benefactor",
    description: "Contributes money to a workspace funding pool.",
  },
  {
    role: "Beneficiary",
    description: "Is the person an allocation or funded service is for.",
  },
  {
    role: "Service provider",
    description: "Delivers the service and receives a recorded payment.",
  },
];

export default async function FinancePage() {
  const auth = await requireWorkspacePermission("funds:view");
  const db = getDb();
  const [members, participants, pools, transactions] = await Promise.all([
    listWorkspaceMembers(db, auth.workspaceId),
    listParticipantRoles(db, auth.workspaceId),
    listFundingPools(db, auth.workspaceId),
    listFinancialTransactions(db, auth.workspaceId),
  ]);

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">$$</span>
          <div>
            <strong>Funds ledger</strong>
            <span>Workspace-scoped financial records</span>
          </div>
        </div>
        <a className="button button-quiet" href="/api/auth/logout">
          Sign out
        </a>
      </header>

      <section className="page-heading">
        <p className="kicker">Money-flow foundation</p>
        <h1>Participants, pools, and records.</h1>
        <p>
          Product subscription billing stays separate. This ledger records who
          contributes, who benefits, and which provider is paid.
        </p>
      </section>

      <section className="finance-role-grid">
        {ROLE_COPY.map((item) => (
          <article className="content-card" key={item.role}>
            <span className="status-pill">{item.role}</span>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <FinanceSetup
        members={members.map((member) => ({
          userId: member.userId,
          label: member.displayName || member.email || member.userId,
        }))}
      />

      <section className="content-grid finance-records">
        <article className="content-card">
          <h2>Funding pools</h2>
          {pools.length ? (
            <div className="workspace-list">
              {pools.map((pool) => (
                <div className="workspace-row" key={pool.id}>
                  <div>
                    <strong>{pool.name}</strong>
                    <span>{pool.id}</span>
                  </div>
                  <span className="status-pill">
                    {pool.currency} · {pool.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No funding pools have been created.</p>
            </div>
          )}
        </article>
        <article className="content-card">
          <h2>Participant roles</h2>
          {participants.length ? (
            <div className="workspace-list">
              {participants.map((participant) => (
                <div
                  className="workspace-row"
                  key={`${participant.userId}:${participant.role}`}
                >
                  <div>
                    <strong>{participant.role.replaceAll("_", " ")}</strong>
                    <span>{participant.userId}</span>
                  </div>
                  <span className="status-pill">{participant.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No participant roles have been assigned.</p>
            </div>
          )}
        </article>
      </section>

      <section className="content-card finance-transactions">
        <div className="members-heading">
          <div>
            <p className="kicker">Immutable history</p>
            <h2>Posted transactions</h2>
          </div>
          <span className="status-pill warning">
            {transactions.length} records
          </span>
        </div>
        {transactions.length ? (
          <div className="member-table">
            {transactions.map((transaction) => (
              <div className="member-row" key={transaction.id}>
                <div>
                  <strong>{transaction.kind.replaceAll("_", " ")}</strong>
                  <span>{transaction.id}</span>
                </div>
                <strong>
                  {(transaction.amount / 100).toLocaleString(undefined, {
                    style: "currency",
                    currency: transaction.currency,
                  })}
                </strong>
                <span className="status-pill">{transaction.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>
              Records appear only after a verified provider event posts a
              balanced transaction.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
