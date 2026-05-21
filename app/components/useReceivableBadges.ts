import { useState, useEffect } from "react";

interface ReceivableSummary {
    totalPending: number;
    totalOverdue: number;
    totalReceived: number;
}

export function useReceivableBadges() {
    const [receivableSummary, setReceivableSummary] = useState<ReceivableSummary>({
        totalPending: 0,
        totalOverdue: 0,
        totalReceived: 0,
    });

    useEffect(() => {
        let unsub: (() => void) | undefined;

        (async () => {
            try {
                const [{ getFirebase }, { onAuthStateChanged }, { collection, query, onSnapshot }] =
                    await Promise.all([
                        import("../../lib/firebase"),
                        import("firebase/auth"),
                        import("firebase/firestore"),
                    ]);

                const { auth, db } = await getFirebase();

                onAuthStateChanged(auth, (user) => {
                    if (!user) {
                        setReceivableSummary({
                            totalPending: 0,
                            totalOverdue: 0,
                            totalReceived: 0,
                        });
                        return;
                    }

                    unsub?.();
                    unsub = onSnapshot(
                        collection(db, "users", user.uid, "receivables"),
                        (snapshot) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);

                            let pending = 0;
                            let overdue = 0;
                            let received = 0;

                            snapshot.docs.forEach((doc) => {
                                const data = doc.data();
                                const status = data.status || "pendente";

                                if (status === "recebido") {
                                    received++;
                                } else {
                                    const dueDate = new Date(data.dueDate + "T00:00:00");
                                    dueDate.setHours(0, 0, 0, 0);
                                    const days = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

                                    if (days < 0) {
                                        overdue++;
                                    } else {
                                        pending++;
                                    }
                                }
                            });

                            setReceivableSummary({
                                totalPending: pending,
                                totalOverdue: overdue,
                                totalReceived: received,
                            });
                        },
                        (err) => {
                            console.error("Erro ao carregar cobrança:", err);
                        }
                    );
                });
            } catch (error) {
                console.error("Erro ao inicializar receivable badges:", error);
            }
        })();

        return () => {
            unsub?.();
        };
    }, []);

    return { receivableSummary };
}