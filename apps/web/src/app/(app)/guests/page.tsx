"use client";

import { useState } from "react";
import { client, dmy } from "@/lib/api";
import { useApi, keys } from "@/lib/query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Badge, Card, Empty, Input, Spinner, Td, Th } from "@/components/ui";
import { ErrorState } from "@/components/error-state";
import { Pagination, Table } from "@/components/patterns";
import { useDebounced } from "@/lib/use-debounced";

export default function GuestsPage() {
  const { activeResort, isStaff } = useAuth();
  const t = useT();
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const take = 50;
  // typing "rahman" used to be six requests; the last one is the only answer
  const debounced = useDebounced(search, 300);

  const { data, isPending, error } = useApi(
    keys.guests(activeResort?.id, `${debounced}:${skip}`),
    () => client.guests.list(activeResort!.id, { search: debounced || undefined, skip, take }),
    { enabled: isStaff && !!activeResort, placeholderData: (prev) => prev },
  );
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  if (!isStaff) return <Empty msg={t("c.staffOnly")} />;
  if (error) return <ErrorState error={error} />;

  return (
    <Card
      title={t("g.title")}
      action={
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSkip(0); // a new search starts at the first page, not page four
          }}
          placeholder={t("g.searchHint")}
          className="!w-60"
        />
      }
      className="!p-0"
    >
      {isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty msg={t("g.none")} />
      ) : (
        <>
        <Table minWidth={640}>
            <thead className="border-b border-slate-100">
              <tr><Th>{t("ds.guest")}</Th><Th>{t("c.phone")}</Th><Th>NID / Passport</Th><Th className="text-right">{t("g.bookings")}</Th><Th>{t("g.lastStay")}</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50/50">
                  <Td className="font-medium">{g.fullName}</Td>
                  <Td className="text-xs">{g.phone}</Td>
                  <Td className="text-xs text-slate-400">{g.nidPassportNo ?? "—"}</Td>
                  <Td className="text-right">{g.bookingCount}</Td>
                  <Td className="text-xs">
                    {g.lastStay ? (
                      <span className="flex items-center gap-2">
                        {dmy(g.lastStay.checkIn)} → {dmy(g.lastStay.checkOut)}
                        <Badge value={g.lastStay.state} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
        </Table>
        <Pagination skip={skip} take={take} total={total} onChange={setSkip} />
        </>
      )}
    </Card>
  );
}
