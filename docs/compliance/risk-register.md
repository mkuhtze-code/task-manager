[risk-register.md](https://github.com/user-attachments/files/32687673/risk-register.md)# Risk register (launch stage)

| ID | Risk | Impact | Likelihood | Treatment |
|----|------|--------|------------|-----------|
| R1 | Account takeover | High | Med | Strong auth providers; session expiry; rate limits on sensitive routes |
| R2 | Cross-user data leak | High | Low | RLS; no service role in client; periodic policy review |
| R3 | Pro feature bypass | Med | Med | UI redirect + API assert + RLS write gates |
| R4 | Stripe webhook forgery | High | Low | Signature verification; idempotent event store |
| R5 | Duplicate subscriptions | Med | Med | Checkout blocks open subs; portal for manage |
| R6 | Charge after account delete | High | Med | Cancel Stripe subs before Auth delete |
| R7 | Storage cost / abuse | Med | Med | 30GB hard quota; private bucket |
| R8 | OAuth token theft | High | Low | Server-side token storage; disconnect path |
| R9 | Dependency / host outage | Med | Med | Status awareness; Vercel/Supabase status pages |
| R10 | Admin misuse | Med | Low | Least privilege; audit log for admin actions |
| R11 | Secrets in git/client | High | Low | Env-only; review PRs for leaks |
| R12 | Incomplete legal review | Med | Med | Publish honest policy; schedule lawyer review |

Update status when treatments ship or residual risk changes.


