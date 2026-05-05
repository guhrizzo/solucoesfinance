// ─── Firestore Debug Helper ───────────────────────────────────────────────────
// Coloque este arquivo em: lib/firestore-debug.ts
// Importe na sua página: import { setupFirestoreDebug } from '@/lib/firestore-debug';
// Execute no console: setupFirestoreDebug();

import React from "react";

export async function setupFirestoreDebug() {
  try {
    const { getFirebase } = await import("./firebase");
    const { auth, db } = await getFirebase();
    const { 
      collection, 
      query, 
      getDocs, 
      doc, 
      getDoc,
      setLogLevel 
    } = await import("firebase/firestore");

    // Ativa logs detalhados do Firestore
    setLogLevel("debug");

    console.log("=== FIRESTORE DEBUG ===\n");

    // 1. Verifica autenticação
    const user = auth.currentUser;
    if (!user) {
      console.error("❌ ERRO: Usuário não autenticado!");
      return;
    }
    console.log("✅ Usuário autenticado:", {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    });

    // 2. Tenta ler costCenters
    console.log("\n--- Teste 1: Leitura de costCenters ---");
    try {
      const centersSnap = await getDocs(collection(db, "costCenters"));
      console.log("✅ Leitura bem-sucedida!");
      console.log(`📊 Total de documentos: ${centersSnap.size}`);
      
      centersSnap.docs.forEach((doc, i) => {
        const data = doc.data();
        console.log(`  [${i}] ID: ${doc.id}`, {
          name: data.name,
          userId: data.userId,
          budget: data.budget,
          "userId === currentUser.uid?": data.userId === user.uid,
        });
      });
    } catch (err: any) {
      console.error("❌ ERRO ao ler costCenters:", {
        code: err.code,
        message: err.message,
        customData: err.customData,
      });
    }

    // 3. Tenta ler expenses
    console.log("\n--- Teste 2: Leitura de expenses ---");
    try {
      const expensesSnap = await getDocs(collection(db, "expenses"));
      console.log("✅ Leitura bem-sucedida!");
      console.log(`📊 Total de documentos: ${expensesSnap.size}`);
      
      expensesSnap.docs.slice(0, 3).forEach((doc, i) => {
        const data = doc.data();
        console.log(`  [${i}] ID: ${doc.id}`, {
          category: data.category,
          userId: data.userId,
          amount: data.amount,
          "userId === currentUser.uid?": data.userId === user.uid,
        });
      });
    } catch (err: any) {
      console.error("❌ ERRO ao ler expenses:", {
        code: err.code,
        message: err.message,
        customData: err.customData,
      });
    }

    // 4. Testa escrita em costCenters
    console.log("\n--- Teste 3: Escrita em costCenters ---");
    try {
      const testDoc = {
        name: "Teste Debug " + Date.now(),
        budget: 1000,
        spent: 0,
        employees: 1,
        color: "#1565c0",
        userId: user.uid,  // IMPORTANTE: adiciona userId
        createdAt: new Date(),
      };
      
      const { addDoc } = await import("firebase/firestore");
      const docRef = await addDoc(collection(db, "costCenters"), testDoc);
      
      console.log("✅ Documento criado com sucesso!");
      console.log("📝 ID:", docRef.id);
      console.log("💾 Dados:", testDoc);

      // Limpa o documento de teste
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "costCenters", docRef.id));
      console.log("🗑️  Documento de teste removido");
    } catch (err: any) {
      console.error("❌ ERRO ao criar documento:", {
        code: err.code,
        message: err.message,
        customData: err.customData,
      });
      
      // Dicas de solução
      if (err.code === "permission-denied") {
        console.log("\n🔍 DICAS PARA RESOLVER permission-denied:");
        console.log("1. Verifique as Firestore Security Rules no Firebase Console");
        console.log("2. Certifique-se de que o campo 'userId' existe no documento");
        console.log("3. Confirme que userId === user.uid");
        console.log("4. Tente estas regras mínimas (apenas para testes):");
        console.log(`
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /{document=**} {
                allow read, write: if request.auth != null;
              }
            }
          }
        `);
      }
    }

    // 5. Verifica estrutura de users/{uid}/
    console.log("\n--- Teste 4: Estrutura users/{uid}/ ---");
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);
      
      if (userSnap.exists()) {
        console.log("✅ Documento de usuário existe");
        console.log("📄 Dados:", userSnap.data());
      } else {
        console.log("⚠️  Documento de usuário NÃO existe");
        console.log("💡 Você pode criar com: updateDoc(userDocRef, { role: 'user' })");
      }
    } catch (err: any) {
      console.error("❌ ERRO ao ler users/{uid}:", {
        code: err.code,
        message: err.message,
      });
    }

    // 6. Resumo das regras esperadas
    console.log("\n=== RESUMO: Regras de Firestore recomendadas ===");
    console.log(`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Dados do usuário
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Centros de custo
    match /costCenters/{costCenterId} {
      allow read, write: if request.auth != null && 
                           resource.data.userId == request.auth.uid;
    }
    
    // Despesas
    match /expenses/{expenseId} {
      allow read, write: if request.auth != null && 
                           resource.data.userId == request.auth.uid;
    }
  }
}
    `);

  } catch (err) {
    console.error("Erro ao executar debug:", err);
  }
}

// ─── Hook para debug automático ────────────────────────────────────────────
export function useFirestoreDebug() {
  const [debugInfo, setDebugInfo] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const { getFirebase } = await import("./firebase");
        const { auth, db } = await getFirebase();
        const { collection, getDocs, query, where } = await import("firebase/firestore");

        const user = auth.currentUser;
        if (!user) {
          setDebugInfo({ error: "Não autenticado" });
          setLoading(false);
          return;
        }

        // Coleta informações
        const centersSnap = await getDocs(
          query(collection(db, "costCenters"), where("userId", "==", user.uid))
        );
        const expensesSnap = await getDocs(
          query(collection(db, "expenses"), where("userId", "==", user.uid))
        );

        setDebugInfo({
          user: { uid: user.uid, email: user.email },
          costCenters: centersSnap.size,
          expenses: expensesSnap.size,
          ok: true,
        });
      } catch (err: any) {
        setDebugInfo({ error: err.code, message: err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { debugInfo, loading };
}