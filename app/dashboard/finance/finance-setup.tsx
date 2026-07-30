"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type MemberOption = { userId: string; label: string };

export function FinanceSetup({ members }: { members: MemberOption[] }) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(members[0]?.userId ?? "");
  const [role, setRole] = useState("benefactor");
  const [poolName, setPoolName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(
      "participant",
      "/api/v1/finance/participants",
      { userId: memberId, role, status: "active" },
    );
  }

  async function createPool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await submit(
      "pool",
      "/api/v1/finance/pools",
      { name: poolName, currency },
    );
    if (succeeded) setPoolName("");
  }

  async function submit(
    key: string,
    url: string,
    body: Record<string, string>,
  ): Promise<boolean> {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Request failed.");
      }
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {message ? (
        <p className="form-error workspace-message" role="alert">
          {message}
        </p>
      ) : null}
      <section className="finance-setup-grid">
        <form className="content-card workspace-create" onSubmit={assignRole}>
          <p className="kicker">Business role</p>
          <h2>Assign participant</h2>
          <label htmlFor="finance-member">Workspace member</label>
          <select
            id="finance-member"
            onChange={(event) => setMemberId(event.target.value)}
            required
            value={memberId}
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.label}
              </option>
            ))}
          </select>
          <label htmlFor="participant-role">Participant role</label>
          <select
            id="participant-role"
            onChange={(event) => setRole(event.target.value)}
            value={role}
          >
            <option value="benefactor">Benefactor</option>
            <option value="beneficiary">Beneficiary</option>
            <option value="service_provider">Service provider</option>
          </select>
          <button
            className="button button-primary"
            disabled={busy !== null || !memberId}
            type="submit"
          >
            {busy === "participant" ? "Saving…" : "Assign role"}
          </button>
        </form>

        <form className="content-card workspace-create" onSubmit={createPool}>
          <p className="kicker">Restricted funds</p>
          <h2>Create funding pool</h2>
          <label htmlFor="pool-name">Pool name</label>
          <input
            id="pool-name"
            maxLength={100}
            minLength={2}
            onChange={(event) => setPoolName(event.target.value)}
            placeholder="Family support pool"
            required
            value={poolName}
          />
          <label htmlFor="pool-currency">Currency</label>
          <input
            id="pool-currency"
            maxLength={3}
            minLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            required
            value={currency}
          />
          <button
            className="button button-primary"
            disabled={busy !== null}
            type="submit"
          >
            {busy === "pool" ? "Creating…" : "Create pool"}
          </button>
        </form>
      </section>
    </>
  );
}
