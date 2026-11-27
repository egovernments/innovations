# Speech-to-text evaluation: full report

The one-page summary is [README.md](README.md). This page has the detail.

The chat panel's mic turns speech into text before the question goes to the chat. This folder holds the evaluation
behind its default model, `mistralai/voxtral-mini-transcribe-3-0`: the method, every result, each clip's transcript
and score, the failures, the decision, and the scripts to run it again. It was run on **2026-11-22** against
OpenRouter's `/api/v1/audio/transcriptions`. The whole run, with and without a language hint, cost **$1.51** as
OpenRouter reported it. Portuguese was added on **2026-11-24** ([Portuguese](#portuguese), $1.14). There is no audio and no key in this folder.

## Contents

- [Data](#data)
- [Method](#method)
- [Results with the language hint](#results-with-the-language-hint)
- [Results without the hint](#results-without-the-hint)
- [Portuguese](#portuguese)
- [Failures](#failures)
- [Decision: why Voxtral is the default](#decision-why-voxtral-is-the-default)
- [In the live app, 2026-11-23](#in-the-live-app-2026-11-23)
- [Not verified yet](#not-verified-yet)
- [Files](#files)
- [Rerunning it](#rerunning-it)
- [Attribution and licences](#attribution-and-licences)

## Data

| Set | Source | Licence | Clips | Audio |
|---|---|---|---|---|
| Niger (`slr57-niger`) | [OpenSLR SLR57](https://www.openslr.org/57/) African Accented French, dev split, `niger_west_african_fr` (West African French) | Apache 2.0 | 80, from 23 speakers | 4.6 min |
| Central Africa (`slr57-central`) | SLR57 test split, CA16 recordings: Gabon 40, Cameroon 24, Chad 8, Congo 8 | Apache 2.0 | 80 | 3.5 min |
| FLEURS fr (`fleurs-fr`) | [Google FLEURS](https://huggingface.co/datasets/google/fleurs) `fr_fr`, test split | CC BY 4.0 | 25 | 4.7 min |
| FLEURS hi (`fleurs-hi`) | FLEURS `hi_in`, test split | CC BY 4.0 | 25 | 5.3 min |
| FLEURS pt (`fleurs-pt`) | FLEURS `pt_br` (Brazilian Portuguese), test split | CC BY 4.0 | 25 | 5.7 min |
| Common Voice, Portugal (`cv-pt-pt`) | [Mozilla Common Voice](https://commonvoice.mozilla.org/) 22.0 Portuguese, test split, speakers who chose the "Portuguese (Portugal)" variant or named Lisbon or Porto as their accent | CC0 1.0 | 40, from 37 speakers | 3.4 min |
| Common Voice, Brazil (`cv-pt-br`) | Common Voice 22.0 Portuguese, test split, the "Portuguese (Brasil)" variant | CC0 1.0 | 40, from 40 speakers | 3.5 min |

- All seven sets are **read speech**.
- **Sampling:** the SLR57 and Common Voice clips are taken round-robin across speakers (Common Voice speakers in a
  fixed order, by a hash of their id; [`pick_pt.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/pick_pt.py)). The FLEURS clips are the first 25 in each test
  archive.
- **No African Portuguese set.** Common Voice has no speakers labelled as Mozambican or Angolan (none in the test,
  dev or train accent labels), and no other open set with such labels was found. European Portuguese stands in for
  the European-pattern Portuguese spoken in Mozambique and Angola; the accent itself is not covered (see
  [Not verified yet](#not-verified-yet)).
- **Common Voice audio is mp3**, kept as distributed: compressed, closer to what a browser sends than FLEURS' WAV.
- **[`data/manifest.jsonl`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/data/manifest.jsonl)** lists all 315 clips (210 French and Hindi, 105 Portuguese). Each line has:
  - the clip id and set, which identify the source utterance (SLR57 file name; FLEURS utterance id);
  - the language;
  - the speaker (SLR57);
  - the audio's path inside the source archive;
  - the reference text;
  - the clip length in seconds.

## Method

- **Two passes.** Every model ran on all 210 clips with `language` set to the clip's language (the *hint*).
  - Each model also ran without it, letting the provider detect the language, on Niger and both FLEURS sets (130 clips).
  - That second pass matters because the panel's **Auto** setting sends no hint.
- **WER** (word error rate) comes from [jiwer](https://github.com/jitsi/jiwer), over all of a set's clips together
  (total errors ÷ total reference words). Both the reference and the transcript are normalised first, by `norm()` in
  [`score.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/score.py):
  1. Unicode NFC, lower case.
  2. Curly apostrophes (’) become straight ones (').
  3. Every character that isn't a letter, a digit, an apostrophe or Devanagari (including its vowel signs) becomes a
     space. That removes punctuation.
  4. Apostrophes are split into spaces, so `c'est` scores as `c est` on both sides.
  5. The danda and double danda (। ॥) become spaces.
  6. For French and Portuguese, a digit written alone from 0 to 10 becomes its word (`3` → `trois` / `três`). For
     Portuguese the masculine form is used (`1` → `um`, `2` → `dois`), so `1` against a spoken *uma* still counts as
     an error. Larger numbers aren't converted, and Hindi numbers aren't normalised at all.
- **Output language without the hint.** OpenRouter returns no detected-language field, so
  [`score_detect.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/score_detect.py) reads it off the text:
  - Devanagari is Hindi, and Arabic script is Urdu.
  - For Latin script, French, English, romanised-Hindi, Portuguese and Spanish function words decide. The
    Portuguese and Spanish lists hold only words the others don't share (Spanish is there to catch Portuguese
    transcribed as Spanish).
  - A clip too short to tell (one or two words) counts as unknown.
- **Latency** is the wall-clock time of one request from the test server: the median per model, and RTF (total
  request time ÷ total audio length).
- **Cost** is OpenRouter's reported `usage.cost`, summed over the hinted pass and divided by the 18.1 minutes of audio.
- **Retries.** Clips refused for their encoding (32-bit float WAV) were rerun after conversion to 16-bit PCM. One
  timeout (Nova-3, no hint) was left as an error. `stt_bench.py` resumes, and it stops after five errors in a row.

## Results with the language hint

| Model | Central Africa | Niger | FLEURS fr | FLEURS hi | Median latency (s) | RTF | $ per audio min |
|---|---|---|---|---|---|---|---|
| assemblyai/universal-3-6-pro | 6.6% | 8.5% | 3.9% | 9.4% | 0.37 | 0.09 | 0.0050 |
| deepgram/nova-3 | 5.1% | 8.6% | 7.5% | 14.0% | 0.65 | 0.15 | 0.0043 |
| elevenlabs/scribe-v2 | 7.5% | 8.6% | **3.0%** | 11.7% | 0.75 | 0.17 | 0.0037 |
| google/chirp-3 | 6.4% | 9.6% | 3.9% | 7.8% | 1.91 | 0.43 | 0.0173 |
| google/gemini-3.5-transcribe | 7.7% | 8.6% | 3.4% | **7.4%** | 2.31 | 0.45 | 0.0053 |
| **mistralai/voxtral-mini-transcribe-3-0** | 6.4% | 9.1% | 3.5% | 8.2% | 0.67 | 0.15 | 0.0032 |
| nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b | 7.5% | 11.1% | 12.1% | 13.3% | 1.33 | 0.28 | 0.0002 |
| openai/gpt-4o-mini-transcribe | 10.3% | 14.6% | 4.2% | 13.6% | 0.85 | 0.18 | 0.0018 |
| openai/gpt-transcribe | 5.5% | **8.2%** | 3.7% | 10.4% | 0.84 | 0.18 | 0.0049 |
| openai/whisper-large-v3-turbo | 9.2% | 13.9% | 7.9% | 61.9% | 1.41 | 0.40 | 0.0003 |
| qwen/qwen3-asr-1.7b | **4.0%** | 8.6% | 4.2% | 13.7% | 0.80 | 0.47 | 0.0004 |

Every model finished every clip, after the reruns described under [Failures](#failures). FLEURS has 25 clips per
language, so a gap of a point or two there is within noise. A self-hosted run, faster-whisper large-v3-turbo (int8, 8
CPU threads), is left out of the table: it took about 21 s per 5 s clip.

## Results without the hint

WER with the hint → without it, latency without it, and the language the transcripts came back in. In the language
column, `?` means too short to classify, `ur` means Arabic script, and `hi-latn` means romanised Hindi.

| Model | Niger | FLEURS fr | FLEURS hi | Median latency (s) | Output language: Niger · FLEURS fr · FLEURS hi |
|---|---|---|---|---|---|
| **voxtral-mini-transcribe-3-0** | 9.1 → 9.6% | 3.5 → 3.3% | 8.2 → 8.0% | 0.77 | 72/80 fr, 7 ?, 1 ur · 25/25 fr · 25/25 hi |
| gemini-3.5-transcribe | 8.6 → 10.3% | 3.4 → 3.0% | 7.4 → 6.9% | 2.30 | 71/80 fr, 9 ? · 25/25 fr · 25/25 hi |
| gpt-transcribe | 8.2 → 10.3% | 3.7 → 4.1% | 10.4 → 10.1% | 0.90 | 72/80 fr, 8 ? · 25/25 fr · 25/25 hi |
| scribe-v2 | 8.6 → 9.4% | 3.0 → 3.3% | 11.7 → 11.6% | 0.80 | 70/80 fr, 9 ?, 1 hi · 25/25 fr · 25/25 hi |
| qwen3-asr-1.7b | 8.6 → 8.9% | 4.2 → 4.3% | 13.7 → 13.0% | 0.93 | 72/80 fr, 8 ? · 25/25 fr · 25/25 hi |
| chirp-3 | 9.6 → 9.7% | 3.9 → 4.3% | 7.8 → 7.2% | 2.19 | 72/80 fr, 7 ?, 1 en · 25/25 fr · 25/25 hi |
| universal-3-6-pro | 8.5 → **13.9%** | 3.9 → 4.1% | 9.4 → 9.3% | 0.39 | 68/80 fr, 8 ?, 3 en, 1 ur · 25/25 fr · 25/25 hi |
| gpt-4o-mini-transcribe | 14.6 → 16.2% | 4.2 → 4.6% | 13.6 → 11.9% | 0.87 | 67/80 fr, 12 ?, 1 hi-latn · 25/25 fr · 25/25 hi |
| nemotron-3.5-asr 0.6b | 11.1 → 11.9% | 12.1 → 11.7% | 13.3 → 15.3% | 1.39 | 71/80 fr, 8 ?, 1 hi · 25/25 fr · 25/25 hi |
| whisper-large-v3-turbo | 13.9 → 17.4% | 7.9 → 16.4% | 61.9 → **75.0%** | 1.29 | 66/80 fr, 8 ?, 4 en, 1 pt, 1 hi-latn · 23/25 fr, 2 en · **12/25 hi**, 7 ?, 5 ur, 1 en |
| nova-3 | 8.6 → **97.1%** | 7.5 → **96.0%** | 14.0 → **100.3%** | 0.55 | 6/80 fr, 63 ?, 10 en, 1 hi-latn · 5/24 fr, 18 ?, 1 en · 0/25 hi, 22 ?, 2 hi-latn, 1 en |

Nova-3's FLEURS fr count is out of 24 because one request timed out and was not rerun. One Whisper Niger clip,
counted as `?` before Portuguese was added to the detector, is Portuguese ("poderiam ser usados em um" for *je
pourrais été utilisé dans un*). With the hint, no model
returned a French clip in a non-Latin script (0 of 185 each). Without it, four models each returned 1 of their 105
French clips in one: Arabic script for Voxtral and AssemblyAI, Devanagari for Scribe and Nemotron.

## Portuguese

Added 2026-11-24, when the panel gained Portuguese (theflywheel/lenspack#39). It ran on 105 clips (12.6 min of
audio): Brazilian Portuguese from FLEURS and Common Voice, and European Portuguese from Common Voice (see
[Data](#data)). All 11 models ran with and without the hint. The run cost **$1.14**, as OpenRouter reported it.

**In one line:** Voxtral, the default, stays the pick for Portuguese. It scores 7.7% (Brazil), 6.0% (Portugal) and
2.3% (FLEURS) WER with the hint, and 8.1 / 7.3 / 2.3% without it, at 0.49 s median and $0.0032 per audio minute.

### With the hint

Latency and cost are measured on the Portuguese clips only.

| Model | Brazil (CV) | Portugal (CV) | FLEURS pt (Brazil) | Median latency (s) | $ per audio min |
|---|---|---|---|---|---|
| assemblyai/universal-3-6-pro | 8.9% | 14.1% | 2.7% | 0.32 | 0.0050 |
| deepgram/nova-3 | **3.0%** | **6.0%** | 7.2% | 0.37 | 0.0043 |
| elevenlabs/scribe-v2 | 9.8% | 6.8% | 3.5% | 0.64 | 0.0037 |
| google/chirp-3 | 10.2% | 11.1% | **2.3%** | 1.68 | 0.0170 |
| google/gemini-3.5-transcribe | 9.8% | 12.0% | 2.9% | 2.08 | 0.0047 |
| **mistralai/voxtral-mini-transcribe-3-0** | 7.7% | **6.0%** | **2.3%** | 0.49 | 0.0032 |
| nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b | 20.9% | 21.8% | 8.9% | 1.25 | 0.0002 |
| openai/gpt-4o-mini-transcribe | 13.2% | 13.7% | 3.9% | 0.85 | 0.0015 |
| openai/gpt-transcribe | 7.7% | 10.7% | 3.2% | 0.74 | 0.0048 |
| openai/whisper-large-v3-turbo | 22.6% | 17.9% | 4.2% | 0.82 | 0.0003 |
| qwen/qwen3-asr-1.7b | 14.0% | 16.2% | 4.1% | 0.74 | 0.0004 |

**Common Voice clips are short.** They average about 5 s, and many are one to three words or a list of place names.
So a single wrong word moves a set's WER more than on FLEURS' long read sentences, and with 40 clips per set a gap of
a few points is within noise.

### Without the hint

Each WER cell reads hint → no hint.
- **Non-Latin** counts the transcripts, out of 105, that came back in another script: the panel's script guard
  refuses these.
- **Empty** counts the transcripts that came back blank.

| Model | Brazil (CV) | Portugal (CV) | FLEURS pt | Non-Latin | Empty |
|---|---|---|---|---|---|
| **voxtral-mini-transcribe-3-0** | 7.7 → 8.1% | 6.0 → 7.3% | 2.3 → 2.3% | 4 | 0 |
| scribe-v2 | 9.8 → 10.6% | 6.8 → 9.4% | 3.5 → 3.6% | 4 | 0 |
| chirp-3 | 10.2 → 10.6% | 11.1 → 11.1% | 2.3 → 2.4% | 1 | 0 |
| gpt-transcribe | 7.7 → 12.3% | 10.7 → 13.7% | 3.2 → 2.7% | 0 | 0 |
| gemini-3.5-transcribe | 9.8 → **17.9%** | 12.0 → 15.0% | 2.9 → 3.8% | 2 | 0 |
| universal-3-6-pro | 8.9 → 9.8% | 14.1 → **22.6%** | 2.7 → 2.7% | 2 | 0 |
| gpt-4o-mini-transcribe | 13.2 → 15.3% | 13.7 → 13.2% | 3.9 → 3.5% | 1 | 0 |
| qwen3-asr-1.7b | 14.0 → 15.3% | 16.2 → 20.1% | 4.1 → 3.8% | 2 | 0 |
| whisper-large-v3-turbo | 22.6 → 21.3% | 17.9 → 24.8% | 4.2 → 3.9% | 1 | 0 |
| nemotron-3.5-asr 0.6b | 20.9 → 22.1% | 21.8 → 28.6% | 8.9 → 8.6% | 4 | 6 |
| nova-3 | 3.0 → **95.7%** | 6.0 → **93.6%** | 7.2 → **99.8%** | 0 | **51** |

- **Voxtral without the hint.** Its 4 non-Latin transcripts are all one- or two-word prompts: *Palma* and *Allahu
  Akbar* in Arabic script, *Mambaí* in Devanagari, and one in Thai.
  - With the hint, it returned none in 105.
  - In the panel, Auto sends the languages it expects (now `en, fr, hi, pt`), so such a guess is transcribed once
    more with a fallback language before anything reaches the input.
- **Nova-3 without a hint fails here as it did on French.** It returns nothing for half the clips and English for
  most of the rest. With the hint it is the most accurate on Common Voice, but Auto sends no hint.
- **The output-language column of `score_detect.py`** now recognises Portuguese and Spanish. On one- and two-word
  prompts it often can't tell (`?`), so the non-Latin count above is the firmer measure. No model's transcripts read
  as Spanish, apart from a single Nemotron clip.

### What it changes

- **No change to the default or the product.** Voxtral is the most accurate model across the three sets taken
  together, it barely moves without the hint, and it is the cheapest of the accurate ones.
- **Nova-3 with a hint** is the best Common Voice result. A deployment where everyone picks Portuguese in the menu
  (which always sends the hint) could choose it in Settings → AI assistant. Auto users would lose it.
- **European versus Brazilian Portuguese:** the leading models do about as well on European Portuguese as on
  Brazilian. Voxtral, Nova-3 and Scribe are under 7% on Portugal (CV).

## Failures

- **Deepgram Nova-3 without a hint falls back to English.**
  - It returned empty text on 75 of 130 clips (47 Niger, 18 FLEURS fr, 10 FLEURS hi), and English for most of the rest.
  - WER was 96–100%. With the hint it is competitive.
  - Auto sends no hint, so it can't be the default.
- **Whisper large-v3-turbo writes Hindi in Urdu script.** Without the hint, 5 of 25 Hindi clips came back in Arabic
  script. The words are right, but they don't match the Devanagari reference, so they score as errors.
- **Whisper returns empty Hindi.** It returned nothing for 8 of 25 Hindi clips with the hint, and for 7 without. That
  is most of its 62–75% WER.
- **32-bit float WAV is refused.**
  - FLEURS ships float WAV. Chirp 3 and AssemblyAI answered "Audio data does not appear to be in a supported
    encoding" (AssemblyAI: "malformed WAV: unknown format: 3") until the clips were converted to 16-bit PCM and rerun.
  - [`fetch_audio.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/fetch_audio.py) converts them. Its conversion loop had a bug until 2026-11-24: it looked up
    file names instead of paths, so nothing was converted. The Portuguese run hit this, and those two models were
    rerun on converted clips. The other nine took FLEURS pt as float WAV; the audio content is the same.
  - The browser sends webm/opus or mp4, so the product doesn't hit this.
- **Whisper on the CPU is too slow.** faster-whisper large-v3-turbo (int8, 8 threads) on a shared 16-core server took
  about 21 s per 5 s clip (RTF about 6). That rules out self-hosting on that hardware.

Every transcript is in [`results/per_clip.csv`](results/per_clip.csv), so each of these can be checked clip by clip.

## Decision: why Voxtral is the default

- **Accurate on every set.** It is in the top group on all four: 6.4 / 9.1 / 3.5 / 8.2% WER.
- **Hardly affected by a missing hint**, which matters because Auto sends none: Niger 9.6%, FLEURS fr 3.3%, FLEURS hi
  8.0%, and every FLEURS clip came back in the right language.
- **Fast.** 0.67 s median, the third-fastest model here.
- **Cheap.** Of the four models under 10% WER on Hindi, it is the cheapest: $0.0032 per audio minute as measured
  ($0.0035 at list price), under half a cent for a minute of speech.

**Alternatives,** chosen by an admin in Settings → AI assistant:
- `google/gemini-3.5-transcribe` had the best Hindi (7.4%, or 6.9% with no hint) and good French, but it is 3–4 times
  slower (2.3 s). Pick it where Hindi matters more than speed.
- `openai/gpt-transcribe` and `qwen/qwen3-asr-1.7b` did best on accented French (Niger 8.2%, Central Africa 4.0%), but
  their Hindi is weaker.

## In the live app, 2026-11-23

**What was seen.** In the deployed panel, a French question came back transcribed in **Persian script** while the
panel's language button said "Auto".

**Cause, as far as the evidence goes.** The hint was never sent. In the benchmark, 0 of 185 French clips came out in a
non-Latin script with a hint (for every model), and 1 of 105 without one (for Voxtral and three others). With the deployed code:
- a language picked in the panel survived a reload, but didn't reach other open tabs;
- a stored "auto" hid the language Superset was set to.

On the test server, a pick of Français is saved, survives a reload and is sent as `language=fr`, so the bug didn't
reproduce there. Another tab or origin is the likely source.

**The fix** (theflywheel/lenspack#21, merged into the superset branch):
- **Precedence.** The language button shows what is in effect:
  - `FR` when picked in the panel;
  - `Auto · FR` when the language comes from Superset or the deployment default (the tooltip says which);
  - otherwise `Auto`.

  A pick made in another tab applies at once. A pick stands until Superset's language changes after it, and a stored
  `auto` no longer hides Superset's language.
- **Script guard on the server.**
  - With a hint, a transcript in a script that language isn't written in is refused (`422 wrong_script`). The panel
    says "Didn't catch that in French: try again" and leaves the input alone.
  - Without a hint, the panel sends the languages it expects (`en, fr, hi`) and its own language as a fallback. A
    guess outside those languages is transcribed once more with the fallback. If that also fails, the server answers
    `422 unsure_language`.
- **Hint logging.** Every speech usage record now carries the hint that was sent and the length of the text returned,
  never the text itself, so the next report like this can be checked.

## Not verified yet

- **Voice notes in the domain.** The sets above are clean read speech. Voice notes from dashboard users bring:
  - room noise and phone microphones;
  - dashboard vocabulary: place names, indicator names, numbers;
  - code-switching.

  WER will be higher. Colleagues are recording 10–20 short notes of real dashboard questions this week (week of
  2026-11-23), in African-accented French and in Hindi.
- **African Portuguese.** No open set labels Mozambican or Angolan speakers, so the Portuguese numbers cover
  Brazil and Portugal only. European Portuguese is the nearest proxy, and the leading models handle it as well as
  Brazilian. A few voice notes from Mozambique or Angola, scored as an own-domain set with
  [`folder_manifest.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/folder_manifest.py), would close this.
- **End to end with a real key.** The server's `POST /api/_stt` is tested against a stub provider. Real clips through
  the deployed mic → server → provider path wait for a production speech-to-text key.

## Files

| File | What |
|---|---|
| [`data/manifest.jsonl`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/data/manifest.jsonl) | the 315 clips: id, set, language, speaker, source path, reference text, seconds |
| [`results/<model>.jsonl`](results/), `…__nohint.jsonl` | the raw output per clip: transcript, latency, OpenRouter usage and cost (22 files, 11 models × 2 passes) |
| [`results/per_clip.csv`](results/per_clip.csv) | one row per clip × model × pass (6,050 rows, 2,310 of them Portuguese): reference, transcript, both normalised, WER, latency, cost |
| [`score.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/score.py) | the WER and latency table, with the normalisation rules (`norm()`) |
| [`score_detect.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/score_detect.py) | hint vs no hint, and the output language read off the text |
| [`per_clip.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/per_clip.py) | builds `results/per_clip.csv` with `score.py`'s normalisation |
| [`stt_bench.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/stt_bench.py) | runs models over a manifest, optionally only some `--sets` (resumable; stops after five errors in a row) |
| [`fetch_audio.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/fetch_audio.py) | streams the source archives, keeps only the manifest's clips (`--sets` for some sets), converts float WAV to 16-bit PCM; `--delete` removes them |
| [`pick_pt.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/pick_pt.py) | picks the Portuguese clips (FLEURS pt_br, Common Voice Portugal and Brazil) and prints their manifest lines |
| [`folder_manifest.py`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/folder_manifest.py) | turns a folder of your own clips plus a `refs.tsv` into a manifest |
| [`data/LICENSE-SLR57-Apache-2.0.txt`](data/LICENSE-SLR57-Apache-2.0.txt) | the licence the SLR57 reference texts are distributed under |

**Origin.** The benchmark began in [theflywheel/lenspack#19](https://github.com/theflywheel/lenspack/pull/19)
(`bench/stt/` at 11c0746), after the voice feature in [theflywheel/lenspack#17](https://github.com/theflywheel/lenspack/pull/17),
and was developed here. Since 2026-11-25 the scripts and the clip list live in the Lenspack repository,
[`evals/speech`](https://github.com/theflywheel/lenspack/tree/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech) ([theflywheel/lenspack#71](https://github.com/theflywheel/lenspack/pull/71)), so anyone can
run it. This folder keeps the write-up and the results; the links above point at commit `09d59f3`.

## Rerunning it

The benchmark runs from the Lenspack repository: [theflywheel/lenspack `evals/speech`](https://github.com/theflywheel/lenspack/tree/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech), pinned to commit
`09d59f3`, the version that matches these results. Its README has the commands:
- fetching the audio, all of it or only some sets, and deleting it afterwards;
- running models with and without the hint, with the OpenRouter key taken from a secret store and never written to
  a file;
- the WER table, the hint versus no-hint view, and the per-clip CSV;
- local Whisper on the CPU;
- scoring your own voice notes from a folder and a `refs.tsv`.

A run there writes `results/<model>.jsonl` in the same format as [`results/`](results/) here.

## Attribution and licences

The reference texts in [`results/per_clip.csv`](results/per_clip.csv), and in the clip list
[`data/manifest.jsonl`](https://github.com/theflywheel/lenspack/blob/09d59f303e11798ae0be7aa07bc248cf23714763/evals/speech/data/manifest.jsonl) in the Lenspack repository, come from three datasets. They are
redistributed under each one's licence, for evaluation. No audio is included.

- **African Accented French (OpenSLR SLR57)**, https://www.openslr.org/57/.
  - Licence: Apache License 2.0 ([copy](data/LICENSE-SLR57-Apache-2.0.txt)).
  - The SLR57 references in the manifest are copied unchanged from the dataset's transcript files, which are already
    lower-case with apostrophes split.
  - Used for the `slr57-niger` and `slr57-central` sets.
- **FLEURS** (Conneau et al., 2022, "FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech"),
  https://huggingface.co/datasets/google/fleurs.
  - Licence: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/.
  - Used for the `fleurs-fr`, `fleurs-hi` and `fleurs-pt` sets.
  - **Changes:** the manifest keeps 25 utterances per language from the test split (`pt_br` uses the raw
    transcription column), with their transcription text as
    distributed. For scoring, `score.py` normalises both the reference and the transcript (see [Method](#method)); the
    stored reference text itself is unchanged.

- **Mozilla Common Voice 22.0, Portuguese**, https://commonvoice.mozilla.org/, read from the mirror at
  https://huggingface.co/datasets/fsicoli/common_voice_22_0.
  - Licence: CC0 1.0 (public domain dedication).
  - Used for the `cv-pt-pt` and `cv-pt-br` sets. The sentences are copied unchanged. The manifest keeps a short hash
    of each speaker id rather than the id itself.

The model transcripts in `results/` were produced by the providers named in each file, through OpenRouter, from that
audio.
