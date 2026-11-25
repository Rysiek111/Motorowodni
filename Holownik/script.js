import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getFirestore, addDoc, collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyC_c5yD2XF-mbCK1NGLYMdIk7UVKGsLxoU",
            authDomain: "motorowodni-49c56.firebaseapp.com",
            projectId: "motorowodni-49c56",
            storageBucket: "motorowodni-49c56.firebasestorage.app",
            messagingSenderId: "634414019790",
            appId: "1:634414019790:web:0e8ffd2c0b613f3b37cc9f",
            measurementId: "G-Z69K7SW8X3"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const appDiv = document.getElementById("app");
        const $ = id => document.getElementById(id);

        // Zestawy pytań (te same dla egzaminu i fiszek)
        const dostepneZestawy = [
            "HOLOWNIK_ZESTAW_1"
        ];

        // Dane kandydata (wspólne dla obu trybów)
        let daneGracza = "";

        // ===========================================================
        // Narzędzia wspólne
        // ===========================================================

        // Zamiana znaków specjalnych, żeby tekst wpisany przez użytkownika nie był traktowany jak kod HTML
        function esc(s) {
            return String(s ?? "").replace(/[&<>"']/g, c => ({
                "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
            }[c]));
        }

        function srcObrazka(url) {
            const s = String(url || "").trim();
            if (!s) return "";
            if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^(https?:|data:image\/)/i.test(s)) return "";
            return s;
        }

        function shuffle(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        function ustawTytul(tekst) {
            $("tytul").textContent = tekst;
        }

        // ===========================================================
        // Ekran startowy: imię i nazwisko + wybór trybu
        // ===========================================================

        window.validateNick = function () {
            const input = $("nickInput");
            const error = $("nickError");
            if (!input) return;

            const value = input.value.trim();
            const ok = value.length >= 3;

            if (value.length === 0) {
                error.textContent = "";
            } else if (!ok) {
                error.textContent = "Wpisz poprawne Imię i Nazwisko (min. 3 znaki)";
                error.style.color = "#f87171";
            } else {
                error.textContent = "OK ✓";
                error.style.color = "#4ade80";
            }

            $("btnEgzamin").disabled = !ok;
            $("btnFiszki").disabled = !ok;
        }

        window.start = function () {
            ustawTytul("Licencja na Holowanie");
            document.body.style.height = "";
            document.body.style.padding = "";

            appDiv.innerHTML = `
                <div class="fade-in">
                    <label class="input-label">Podaj Imię i Nazwisko kandydata</label>
                    <div class="input-wrapper">
                        <span class="icon">👤</span>
                        <input id="nickInput" maxlength="60" placeholder="Wpisz swoje Imię i Nazwisko..." value="${esc(daneGracza)}" oninput="validateNick()" autocomplete="off">
                    </div>
                    <div id="nickError" class="error"></div>
                </div>
                <div class="fade-in" style="animation-delay:0.1s; margin-top: 15px;">
                    <button id="btnEgzamin" onclick="startQuiz()" disabled>
                        📝 Test
                    </button>
                    <button id="btnFiszki" onclick="startFiszki()" disabled>
                        📚 Fiszki
                        <div>
                        <small>Po każdej odpowiedzi od razu widzisz poprawną.</small>
                        </div>
                    </button>
                </div>
            `;

            validateNick();
            $("nickInput").focus();
        }

        // Odczytuje imię z pola (jeśli ekran startowy jest widoczny) i sprawdza poprawność
        function pobierzImie() {
            const input = $("nickInput");
            if (input) daneGracza = input.value.trim();
            return daneGracza.length >= 3;
        }

        // ===========================================================
        // TRYB 1: EGZAMIN (wynik zapisywany w bazie)
        // ===========================================================

        let pytania = [];
        let wybory = [];
        let poprawne = 0;
        let index = 0;
        let wybranyZestaw = "";
        let pokazanoO = 0;   // czas wyświetlenia pytania (ochrona przed podwójnym tapnięciem)

        // Ustawienia tego quizu
        const KOLEKCJA_WYNIKOW = "holownik";
        const PROG_ZALICZENIA = 20 / 25;   // ułamek poprawnych odpowiedzi potrzebny do zaliczenia

        window.startQuiz = async function () {
            if (!pobierzImie()) return;

            ustawTytul("Egzamin – Licencja Holownika");

            const losowyIndeks = Math.floor(Math.random() * dostepneZestawy.length);
            wybranyZestaw = dostepneZestawy[losowyIndeks];

            try {
                appDiv.innerHTML = `<h2>Generowanie losowego arkusza egzaminacyjnego...</h2>`;
                const docRef = doc(db, "baza_pytan_holownik", wybranyZestaw);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    pytania = (docSnap.data().pytania || []).filter(fPoprawnePytanie);
                    if (!pytania.length) {
                        alert("Ten zestaw nie zawiera poprawnych pytań!");
                        start();
                        return;
                    }
                } else {
                    alert("Wystąpił problem z konfiguracją arkuszy w bazie danych!");
                    start();
                    return;
                }
            } catch (err) {
                console.error(err);
                alert("Błąd połączenia z bazą Firebase!");
                start();
                return;
            }

            index = 0;
            wybory = [];
            poprawne = 0;

            pytania.forEach(p => {
                p.odpowiedziLosowe = [...p.odp].map((x, i) => ({ tekst: x, idx: i }));
                shuffle(p.odpowiedziLosowe);
            });
            pokazPytanie();
        }

        function pokazPytanie() {
            if (index >= pytania.length) {
                appDiv.innerHTML = `
                    <div class="progress">
                        <div class="progress-inner" style="width:100%"></div>
                    </div>
                    <h2 class="fade" style="text-align:center;">
                        Dziękuję za odpowiedzi! Trwa obliczanie wyniku...
                    </h2>
                `;
                zapiszWybor();
                return;
            }

            let p = pytania[index];
            let progress = (index / pytania.length) * 100;
            let idx = p.odpowiedziLosowe;

            let html = `
                <div class="progress">
                    <div class="progress-inner" style="width:${progress}%"></div>
                </div>
                <h2 class="fade">
                    Pytanie ${index + 1} z ${pytania.length}<br><br>
                    ${esc(p.tresc)}
                </h2>
            `;

            if (p.obrazek) {
                html += `<img src="${esc(srcObrazka(p.obrazek))}" alt="Rysunek pomocniczy" class="question-img fade">`;
            }

            idx.forEach((i) => {
                html += `
                    <button class="fade" onclick="wybierz(${i.idx})">
                        ${esc(i.tekst)}
                    </button>
                `;
            });

            appDiv.innerHTML = html;
            pokazanoO = Date.now();
        }

        window.wybierz = function (i) {
            if (Date.now() - pokazanoO < 400) return;
            let p = pytania[index];
            const czyPoprawna = i === p.poprawna;
            if (czyPoprawna) poprawne++;

            wybory.push({
                NumerPytania: index + 1,
                pytanie: p.tresc,
                obrazek: p.obrazek || "",
                odpowiedz: p.odp[i],
                poprawna: p.odp[p.poprawna],
                wynik: czyPoprawna
            });

            index++;
            pokazPytanie();
        }

        async function zapiszWybor() {
            let bladZapisu = "";
            try {
                await addDoc(collection(db, KOLEKCJA_WYNIKOW), {
                    gracz: daneGracza,
                    zestaw: wybranyZestaw,
                    wybory: wybory,
                    poprawne: poprawne,
                    procent: Number(((poprawne / pytania.length) * 100).toFixed(2)),
                    data: new Date()
                });
            } catch (e) {
                console.error(e);
                bladZapisu = (e && e.code === "permission-denied")
                    ? "Baza odrzuciła zapis wyniku (brak uprawnień)."
                    : "Nie udało się zapisać wyniku w bazie (sprawdź połączenie z internetem).";
            }
            // Podsumowanie pokazujemy zawsze, także gdy zapis się nie powiódł
            pokazPodsumowanie(bladZapisu);
        }

        window.ponowZapis = function () {
            appDiv.innerHTML = `<h2 style="text-align:center;">Zapisywanie wyniku...</h2>`;
            zapiszWybor();
        }

        function pokazPodsumowanie(bladZapisu) {
            let podsumowanieSzczegolowe = "";
            wybory.forEach((w) => {
                podsumowanieSzczegolowe += `
                    <div style="text-align: left; background: #10161c; padding: 15px; border-radius: 8px; margin-bottom: 12px; border: 1px solid ${w.wynik ? 'rgba(74, 222, 128, 0.4)' : 'rgba(248, 113, 113, 0.4)'}; border-left: 5px solid ${w.wynik ? '#4ade80' : '#f87171'}">
                        <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 15px; color: #F5F3EC;">Pytanie ${w.NumerPytania}: ${esc(w.pytanie)}</p>
                        ${srcObrazka(w.obrazek) ? `<img src="${esc(srcObrazka(w.obrazek))}" style="max-width:250px;display:block;margin:10px auto;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,.5);">` : ""}
                        <p style="margin: 4px 0; font-size: 14px; color: ${w.wynik ? '#4ade80' : '#f87171'}">
                            <strong>Twoja odpowiedź:</strong> ${esc(w.odpowiedz)} ${w.wynik ? '✓' : '✗'}
                        </p>
                        ${!w.wynik ? `<p style="margin: 4px 0; font-size: 14px; color: #4ade80"><strong>Poprawna odpowiedź:</strong> ${esc(w.poprawna)}</p>` : ''}
                    </div>
                `;
            });

            const procent = Math.round((poprawne / pytania.length) * 100);
            const czyZdal = (poprawne / pytania.length) >= PROG_ZALICZENIA;

            const statusEgzaminu = czyZdal
                ? "<span style='color:#4ade80; text-shadow: 0 0 10px rgba(74, 222, 128, 0.4);'>ZALICZONY ✓</span>"
                : "<span style='color:#f87171;'>NIEZALICZONY ✗</span>";

            const ostrzezenie = bladZapisu ? `
                <div style="background: rgba(248, 113, 113, 0.15); border: 1px solid #f87171; color: #fecaca; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                    ⚠️ ${bladZapisu}<br>Twój wynik poniżej jest poprawny, ale nie został zapisany.<br>
                    <button onclick="ponowZapis()" style="margin-top: 10px; max-width: 240px;">Spróbuj zapisać ponownie</button>
                </div>` : "";

            appDiv.innerHTML = `
                <div style="text-align:center;" class="fade">
                    <h2>Egzamin zakończony!</h2>
                    <p style="font-size: 18px; color: #B5A79D;"><strong>${esc(daneGracza)}</strong></p>
                    <p style="font-size: 16px; color: #F5F3EC; margin-top:5px;">Wynik egzaminu: ${statusEgzaminu}</p>
                    <h2 style="color: #FF6B1A; margin-top: 10px; margin-bottom: 25px; text-shadow: 0 0 10px rgba(255,107,26,0.3);">
                        Twój wynik: ${poprawne} / ${pytania.length}<br>
                        Procent: ${procent}%
                    </h2>
                    ${ostrzezenie}
                    <div style="max-height: 400px; overflow-y: auto; margin-bottom: 20px; padding-right: 5px;">
                        ${podsumowanieSzczegolowe}
                    </div>

                    <button onclick="startQuiz()" style="display:block; margin: 10px auto; max-width: 260px;">Rozwiąż ponownie</button>
                    <button class="drugi" onclick="start()" style="display:block; margin: 8px auto; max-width: 260px;">← Wróć do wyboru</button>
                </div>
            `;

            if (window.innerHeight < 800) {
                document.body.style.height = "auto";
                document.body.style.padding = "20px 0";
            }
        }

        // ===========================================================
        // TRYB 2: FISZKI (tylko odczyt pytań, nic nie jest zapisywane)
        // ===========================================================

        let fPytania = [];        // wszystkie wczytane pytania ze wszystkich zestawów
        let fKolejka = [];        // pytania w bieżącej rundzie: { p, odp }
        let fBledne = [];         // pytania, na które w tej rundzie odpowiedziano źle
        let fUwagi = "";          // informacje o pominiętych pytaniach / niewczytanych zestawach
        let fIndex = 0;
        let fDobre = 0;
        let fZle = 0;
        let fWybrana = null;      // oryginalny indeks wybranej odpowiedzi
        let fZatwierdzone = false;

        function fPoprawnePytanie(p) {
            return p && typeof p.tresc === "string" && Array.isArray(p.odp) && p.odp.length >= 2
                && Number.isInteger(p.poprawna) && p.poprawna >= 0 && p.poprawna < p.odp.length;
        }

        window.startFiszki = function () {
            if (!pobierzImie()) return;
            fWczytaj();
        }

        function fBlad(info) {
            appDiv.innerHTML = `
                <div class="srodek fade">
                    <div class="komunikat">${esc(info)}</div>
                    <button data-fakcja="ponow">🔄 Spróbuj ponownie</button>
                    <button class="drugi" data-fakcja="menu">← Wróć do wyboru</button>
                </div>`;
        }

        async function fWczytaj() {
            ustawTytul("Fiszki – Licencja Holownika");
            appDiv.innerHTML = `<h2 class="srodek">Wczytywanie pytań...</h2>`;

            const ids = dostepneZestawy;
            const wyniki = await Promise.allSettled(ids.map(id => getDoc(doc(db, "baza_pytan_holownik", id))));

            const zebrane = [];
            const niewczytane = [];
            let pominiete = 0;

            wyniki.forEach((r, k) => {
                if (r.status !== "fulfilled" || !r.value.exists() || !Array.isArray(r.value.data().pytania)) {
                    niewczytane.push(ids[k]);
                    return;
                }
                r.value.data().pytania.forEach(p => {
                    if (fPoprawnePytanie(p)) zebrane.push(p);
                    else pominiete++;
                });
            });

            if (!zebrane.length) {
                fBlad("Nie udało się wczytać pytań" + (niewczytane.length ? " (" + niewczytane.join(", ") + ")" : "") + ". Sprawdź połączenie i spróbuj ponownie.");
                return;
            }

            const czesci = [];
            if (niewczytane.length) czesci.push("Nie wczytano: " + niewczytane.join(", "));
            if (pominiete) czesci.push("Pominięto " + pominiete + " pytań bez zaznaczonej poprawnej odpowiedzi");
            fUwagi = czesci.join(". ");

            fPytania = zebrane;
            fStartRunda(fPytania);
        }

        function fStartRunda(lista) {
            const baza = shuffle(lista.slice());
            fKolejka = baza.map(p => ({
                p,
                odp: shuffle(p.odp.map((tekst, i) => ({ tekst, idx: i })))
            }));
            fBledne = [];
            fIndex = 0;
            fDobre = 0;
            fZle = 0;
            fPokazPytanie();
        }

        function fPokazPytanie() {
            if (fIndex >= fKolejka.length) {
                fKoniec();
                return;
            }

            const { p, odp } = fKolejka[fIndex];
            fWybrana = null;
            fZatwierdzone = false;

            const proc = (fIndex / fKolejka.length) * 100;
            const src = srcObrazka(p.obrazek);

            appDiv.innerHTML = `
                <div class="progress"><div class="progress-inner" style="width:${proc}%"></div></div>
                <div class="pasek">
                    <span>Pytanie ${fIndex + 1} z ${fKolejka.length}</span>
                    <span><b class="ok" id="fLicznikDobre">✓ ${fDobre}</b> &nbsp; <b class="zle-txt" id="fLicznikZle">✗ ${fZle}</b></span>
                </div>
                ${fUwagi ? `<div class="komunikat">${esc(fUwagi)}</div>` : ""}
                <h2 class="fade">${esc(p.tresc)}</h2>
                ${src ? `<img class="question-img fade" src="${esc(src)}" alt="Rysunek pomocniczy"
                    onerror="this.outerHTML='<p class=&quot;muted srodek&quot;>⚠ Nie udało się wczytać obrazka do tego pytania.</p>'">` : ""}
                <div id="fOdpowiedzi">
                    ${odp.map((o, k) => `
                        <button class="odp fade" data-fidx="${o.idx}"><span class="nr">${k + 1}</span><span>${esc(o.tekst)}</span></button>
                    `).join("")}
                </div>
                <div id="fFeedback" class="feedback" hidden></div>
                <button id="fAkcja" data-fakcja="zatwierdz" disabled>Zatwierdź odpowiedź</button>
                <button class="drugi" data-fakcja="menu">← Zakończ naukę i wróć do wyboru</button>
            `;
        }

        function fWybierz(idx) {
            if (fZatwierdzone) return;
            fWybrana = idx;
            document.querySelectorAll(".odp").forEach(b => {
                b.classList.toggle("wybrana", Number(b.dataset.fidx) === idx);
            });
            $("fAkcja").disabled = false;
        }

        function fZatwierdz() {
            if (fZatwierdzone || fWybrana === null) return;
            fZatwierdzone = true;

            const { p } = fKolejka[fIndex];
            const dobrze = fWybrana === p.poprawna;

            if (dobrze) {
                fDobre++;
            } else {
                fZle++;
                if (!fBledne.includes(p)) fBledne.push(p);
            }

            document.querySelectorAll(".odp").forEach(b => {
                const i = Number(b.dataset.fidx);
                b.classList.remove("wybrana");
                b.classList.add("zablokowana");
                if (i === p.poprawna) b.classList.add("dobra");
                else if (i === fWybrana) b.classList.add("zla");
            });

            const fb = $("fFeedback");
            fb.hidden = false;
            fb.className = "feedback fade " + (dobrze ? "dobrze" : "zle");
            fb.innerHTML = dobrze
                ? "✓ Dobrze!"
                : `✗ Źle. Poprawna odpowiedź: <b>${esc(p.odp[p.poprawna])}</b>`;

            $("fLicznikDobre").textContent = "✓ " + fDobre;
            $("fLicznikZle").textContent = "✗ " + fZle;

            const a = $("fAkcja");
            a.disabled = false;
            a.dataset.fakcja = "dalej";
            a.textContent = (fIndex + 1 >= fKolejka.length) ? "Zobacz wynik" : "Dalej →";
        }

        function fDalej() {
            fIndex++;
            fPokazPytanie();
        }

        function fKoniec() {
            const razem = fKolejka.length;
            const proc = Math.round((fDobre / razem) * 100);

            appDiv.innerHTML = `
                <div class="srodek fade">
                    <h2>Runda zakończona</h2>
                    <div class="wynik">${fDobre} / ${razem} (${proc}%)</div>
                    <p class="muted">To tylko ćwiczenie – wynik nie został zapisany.</p>
                    ${fBledne.length
                        ? `<button data-fakcja="powtorz">🔁 Powtórz błędne (${fBledne.length})</button>`
                        : `<p class="ok"><b>Wszystko poprawnie! 🎉</b></p>`}
                    <button data-fakcja="odnowa">🔄 Zacznij od nowa (nowe wymieszanie)</button>
                    <button class="drugi" data-fakcja="menu">← Wróć do wyboru</button>
                </div>`;
        }

        // Obsługa przycisków fiszek (przyciski egzaminu mają własne onclick)
        appDiv.addEventListener("click", e => {
            const b = e.target.closest("button");
            if (!b) return;

            if (b.dataset.fidx !== undefined) {
                fWybierz(Number(b.dataset.fidx));
            } else if (b.dataset.fakcja === "zatwierdz") {
                fZatwierdz();
            } else if (b.dataset.fakcja === "dalej") {
                fDalej();
            } else if (b.dataset.fakcja === "powtorz") {
                fStartRunda(fBledne.slice());
            } else if (b.dataset.fakcja === "odnowa") {
                fStartRunda(fPytania);
            } else if (b.dataset.fakcja === "ponow") {
                fWczytaj();
            } else if (b.dataset.fakcja === "menu") {
                start();
            }
        });

        // Skróty w fiszkach: 1/2/3 wybiera odpowiedź, Enter zatwierdza lub przechodzi dalej
        document.addEventListener("keydown", e => {
            if (e.repeat || !$("fAkcja")) return;

            if (/^[1-9]$/.test(e.key)) {
                if (fZatwierdzone) return;
                const btn = document.querySelectorAll(".odp")[Number(e.key) - 1];
                if (btn) {
                    e.preventDefault();
                    fWybierz(Number(btn.dataset.fidx));
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (!fZatwierdzone) fZatwierdz();
                else fDalej();
            }
        });


        start();