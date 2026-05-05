// ─── Firestore Inspector ───────────────────────────────────────────────────
// Para usar: import { inspectFirestore } from '@/lib/firestore-inspect';
// No console: inspectFirestore()

export async function inspectFirestore() {
  try {
    const { getFirebase } = await import("./firebase");
    const { auth, db } = await getFirebase();
    const { collection, getDocs, limit } = await import("firebase/firestore");

    const user = auth.currentUser;
    if (!user) {
      console.log("❌ Não autenticado");
      return;
    }

    console.log("=== INSPEÇÃO DO FIRESTORE ===\n");
    console.log(`User UID: ${user.uid}\n`);

    // 1. Inspeciona costCenters
    console.log("--- costCenters (primeiros 5) ---");
    try {
      const centersSnap = await getDocs(
        collection(db, "costCenters")
      );
      
      if (centersSnap.empty) {
        console.log("⚠️  Nenhum documento em costCenters");
      } else {
        centersSnap.docs.slice(0, 5).forEach((doc, i) => {
          const data = doc.data();
          console.log(`\n[${i}] ID: ${doc.id}`);
          console.log("Campos:", Object.keys(data));
          console.log("userId no doc:", data.userId);
          console.log("userId === currentUser.uid?", data.userId === user.uid);
          console.log("Dados completos:", data);
        });
      }
    } catch (e: any) {
      console.error("❌ Erro ao ler costCenters:", e.code, e.message);
    }

    // 2. Inspeciona expenses
    console.log("\n--- expenses (primeiros 5) ---");
    try {
      const expensesSnap = await getDocs(
        collection(db, "expenses")
      );
      
      if (expensesSnap.empty) {
        console.log("⚠️  Nenhum documento em expenses");
      } else {
        expensesSnap.docs.slice(0, 5).forEach((doc, i) => {
          const data = doc.data();
          console.log(`\n[${i}] ID: ${doc.id}`);
          console.log("Campos:", Object.keys(data));
          console.log("userId no doc:", data.userId);
          console.log("userId === currentUser.uid?", data.userId === user.uid);
          console.log("Dados completos:", data);
        });
      }
    } catch (e: any) {
      console.error("❌ Erro ao ler expenses:", e.code, e.message);
    }

    // 3. Verifica estrutura de users
    console.log("\n--- Estrutura de users ---");
    try {
      const usersSnap = await getDocs(
        collection(db, "users")
      );
      
      console.log(`Total de documentos em /users: ${usersSnap.size}`);
      if (usersSnap.size > 0) {
        usersSnap.docs.slice(0, 3).forEach((doc, i) => {
          console.log(`\n[${i}] UID: ${doc.id}`);
          console.log("Dados:", doc.data());
        });
      }
    } catch (e: any) {
      console.error("❌ Erro ao ler users:", e.code, e.message);
    }

    console.log("\n=== FIM DA INSPEÇÃO ===");
  } catch (err) {
    console.error("Erro geral:", err);
  }
}

// Versão simplificada para testar permissões
export async function testPermissions() {
  try {
    const { getFirebase } = await import("./firebase");
    const { auth, db } = await getFirebase();
    const { collection, getDocs, addDoc, deleteDoc, doc } = await import("firebase/firestore");

    const user = auth.currentUser;
    if (!user) {
      console.log("❌ Não autenticado");
      return;
    }

    console.log("=== TESTE DE PERMISSÕES ===\n");

    // Teste 1: Ler costCenters
    console.log("1️⃣  Testando LEITURA de costCenters...");
    try {
      const snap = await getDocs(collection(db, "costCenters"));
      console.log(`   ✅ Sucesso! ${snap.size} documentos`);
    } catch (e: any) {
      console.log(`   ❌ Falhou: ${e.code}`);
    }

    // Teste 2: Ler expenses
    console.log("\n2️⃣  Testando LEITURA de expenses...");
    try {
      const snap = await getDocs(collection(db, "expenses"));
      console.log(`   ✅ Sucesso! ${snap.size} documentos`);
    } catch (e: any) {
      console.log(`   ❌ Falhou: ${e.code}`);
    }

    // Teste 3: Escrever em costCenters
    console.log("\n3️⃣  Testando ESCRITA em costCenters...");
    try {
      const ref = await addDoc(collection(db, "costCenters"), {
        name: `Teste ${Date.now()}`,
        budget: 1000,
        spent: 0,
        employees: 1,
        color: "#1565c0",
        userId: user.uid,
        createdAt: new Date(),
      });
      console.log(`   ✅ Sucesso! ID: ${ref.id}`);
      
      // Cleanup
      await deleteDoc(doc(db, "costCenters", ref.id));
      console.log(`   🗑️  Documento de teste removido`);
    } catch (e: any) {
      console.log(`   ❌ Falhou: ${e.code} - ${e.message}`);
    }

    // Teste 4: Escrever em expenses
    console.log("\n4️⃣  Testando ESCRITA em expenses...");
    try {
      const ref = await addDoc(collection(db, "expenses"), {
        description: `Teste ${Date.now()}`,
        category: "Teste",
        center: "Centro Teste",
        amount: 100,
        date: new Date().toISOString().split("T")[0],
        status: "pago",
        userId: user.uid,
        createdAt: new Date(),
      });
      console.log(`   ✅ Sucesso! ID: ${ref.id}`);
      
      // Cleanup
      await deleteDoc(doc(db, "expenses", ref.id));
      console.log(`   🗑️  Documento de teste removido`);
    } catch (e: any) {
      console.log(`   ❌ Falhou: ${e.code} - ${e.message}`);
    }

    console.log("\n=== FIM DO TESTE ===");
  } catch (err) {
    console.error("Erro geral:", err);
  }
}