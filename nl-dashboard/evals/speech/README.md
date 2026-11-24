# Speech-to-text eval

**In short.** The chat panel's mic turns a spoken question into text before it goes to the chat. We compared 11
speech-to-text models on 315 clips of read speech from public datasets: African-accented and European French, Hindi,
and Brazilian and European Portuguese, about 31 minutes in all. **Mistral's Voxtral Mini Transcribe 3.0 is the
default**: it is in the top group on every set (2.3% to 9.1% word error rate), barely changes when the panel doesn't
say which language to expect, answers in about 0.7 s (on the French and Hindi clips), and costs $0.0032 per minute
of audio. Google's Gemini 3.5
Transcribe is the alternative where Hindi matters most. The clips are clean read speech, so real voice notes will do
worse; there is no labelled speech from Mozambique or Angola yet.

The full report, with the method, every failure, a wrong-script transcript seen in the deployed app, and the
licences, is
[SPEECH.md](SPEECH.md). Every transcript and its score is in [`results/per_clip.csv`](results/per_clip.csv).

## Data

All clips are read speech from public datasets. No audio is stored here; [`data/manifest.jsonl`](data/manifest.jsonl)
lists each clip's source, reference text and length, and [`fetch_audio.py`](fetch_audio.py) downloads them for a run.

| Set | Language and accent | Source | Licence | Clips | Speakers | Minutes |
|---|---|---|---|---|---|---|
| Central Africa | French: Gabon 40, Cameroon 24, Chad 8, Congo 8 | [OpenSLR SLR57](https://www.openslr.org/57/) African Accented French, test split (CA16 recordings) | Apache 2.0 | 80 | 10 | 3.5 |
| Niger | French, West African (Niger) | SLR57, dev split, `niger_west_african_fr` | Apache 2.0 | 80 | 23 | 4.6 |
| FLEURS fr | French (France) | [Google FLEURS](https://huggingface.co/datasets/google/fleurs) `fr_fr`, test split | CC BY 4.0 | 25 | | 4.7 |
| FLEURS hi | Hindi (India) | FLEURS `hi_in`, test split | CC BY 4.0 | 25 | | 5.3 |
| Common Voice Brazil | Portuguese, Brazil | [Mozilla Common Voice](https://commonvoice.mozilla.org/) 22.0 Portuguese, test split, speakers who chose "Portuguese (Brasil)" | CC0 1.0 | 40 | 40 | 3.5 |
| Common Voice Portugal | Portuguese, Portugal | Common Voice 22.0, speakers who chose "Portuguese (Portugal)" or named Lisbon or Porto as their accent | CC0 1.0 | 40 | 37 | 3.4 |
| FLEURS pt | Portuguese, Brazil | FLEURS `pt_br`, test split | CC BY 4.0 | 25 | | 5.7 |

By language: French 185 clips (12.8 min), Hindi 25 (5.3 min), Portuguese 105 (12.6 min). The FLEURS manifest doesn't
record speakers, so those cells are blank.

What each source is:
- **SLR57, African Accented French:** French read aloud by speakers in Niger and in Central Africa (Gabon, Cameroon,
  Chad, Congo). The sentences are short and everyday: directions, travel, health. It is the nearest open match to
  francophone West and Central African users.
- **FLEURS:** Google's benchmark of the same set of sentences (from the FLoRes-101 translation benchmark,
  Wikipedia-family articles) read aloud in 102 languages. The sentences are long and formal, with names and numbers.
- **Common Voice:** Mozilla's crowd-sourced speech. Volunteers read short prompts on their own devices and say which
  accent they have. Many prompts are one to three words, and the audio is compressed mp3, closer to what a browser
  sends than FLEURS' studio WAV.

**How clips were picked.** SLR57 and Common Voice clips are taken in turn across speakers (Common Voice speakers in a
fixed order, by a hash of their id; [`pick_pt.py`](pick_pt.py)). The FLEURS clips are the first 25 in each test
archive.

## Example sentences

Reference texts quoted from the public datasets, as stored in the manifest. English glosses are ours.

| Language | Sentence | Source |
|---|---|---|
| French, Niger | « vous ne pouvez pas conduire votre véhicule ou marcher dans cette direction » (you can't drive or walk in that direction) | SLR57, `niger_sys2_8_612`, Apache 2.0 |
| French, Chad | « Y a-t-il une autre route pour se rendre à l’hôpital? » (is there another road to the hospital?) | SLR57 CA16, `chad_m_001_018`, Apache 2.0 |
| French, France | « Le chocolat chaud est conforme aux normes belges. Les jus de fruits sont chers mais excellents. » (the hot chocolate is up to Belgian standards; the fruit juices are expensive but excellent) | FLEURS `fr_fr`, utterance 10703796668246155041, CC BY 4.0 |
| Hindi | « टेलीविजन रिपोर्टों में प्लांट से निकलने वाला सफेद धुआँ दिखाया गया है। » (television reports show white smoke coming from the plant) | FLEURS `hi_in`, utterance 10027305580492162464, CC BY 4.0 |
| Hindi | « कैल्शियम और पोटैशियम जैसे तत्वों को धातु माना जाता है। बेशक, चांदी और सोने जैसी धातुएं भी हैं। » (elements such as calcium and potassium are counted as metals; there are of course also metals such as silver and gold) | FLEURS `hi_in`, utterance 10761312360331088376, CC BY 4.0 |
| Portuguese, Brazil | « Nos arquipélagos e lagos, você não precisa necessariamente de um iate. » (in archipelagos and lakes you don't necessarily need a yacht) | FLEURS `pt_br`, utterance 10556936069191551163, CC BY 4.0 |
| Portuguese, Brazil | « A sustentabilidade é uma parte central de nossa missão. » (sustainability is a central part of our mission) | Common Voice 22.0, `common_voice_pt_39577994`, CC0 |
| Portuguese, Portugal | « Uma mulher com uma bolsa branca está subindo as escadas. » (a woman with a white bag is going up the stairs) | Common Voice 22.0, `common_voice_pt_36845020`, CC0 |

FLEURS: Conneau et al., 2022, "FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech". Full
attribution in [SPEECH.md](SPEECH.md#attribution-and-licences).

## Models

All 11 were called through OpenRouter's transcription endpoint (a service that resells many providers' models
behind one API), on 22 November 2026 (French and Hindi) and 24 November 2026 (Portuguese). Each ran twice: once told the clip's language (*with the hint*) and once left to detect it (*no hint*),
because the panel's **Auto** setting sends no hint.

| Model | OpenRouter id |
|---|---|
| AssemblyAI Universal-3.6 Pro | `assemblyai/universal-3-6-pro` |
| Deepgram Nova-3 | `deepgram/nova-3` |
| ElevenLabs Scribe v2 | `elevenlabs/scribe-v2` |
| Google Chirp 3 | `google/chirp-3` |
| Google Gemini 3.5 Transcribe | `google/gemini-3.5-transcribe` |
| **Mistral Voxtral Mini Transcribe 3.0** | `mistralai/voxtral-mini-transcribe-3-0` |
| NVIDIA Nemotron 3.5 ASR 0.6B | `nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b` |
| OpenAI GPT-4o mini Transcribe | `openai/gpt-4o-mini-transcribe` |
| OpenAI GPT Transcribe | `openai/gpt-transcribe` |
| OpenAI Whisper large-v3 turbo | `openai/whisper-large-v3-turbo` |
| Qwen3-ASR 1.7B | `qwen/qwen3-asr-1.7b` |

A self-hosted Whisper large-v3 turbo (faster-whisper, int8, 8 CPU threads) was also tried and dropped: it took about
21 s per 5 s clip.

## Results

**Word error rate (WER)** is the share of reference words the transcript got wrong (substituted, dropped or added),
over all of a set's clips together; lower is better. Punctuation, case and apostrophes are ignored, and in French and
Portuguese a lone digit from 0 to 10 counts as its word ([method](SPEECH.md#method)). Latency is the median time for one
request; cost is OpenRouter's reported cost per minute of audio. **In the tables below, latency and cost cover only
the French and Hindi clips** (210 of the 315), so the column headings say "fr + hi". Portuguese-only figures are in
[SPEECH.md](SPEECH.md#portuguese) (Voxtral: 0.49 s, $0.0032).

### With the language hint

| Model | Central Africa fr | Niger fr | FLEURS fr | FLEURS hi | CV Brazil pt | CV Portugal pt | FLEURS pt | Latency, fr + hi (s) | $ per audio min, fr + hi |
|---|---|---|---|---|---|---|---|---|---|
| AssemblyAI Universal-3.6 Pro | 6.6% | 8.5% | 3.9% | 9.4% | 8.9% | 14.1% | 2.7% | 0.37 | 0.0050 |
| Deepgram Nova-3 | 5.1% | 8.6% | 7.5% | 14.0% | **3.0%** | **6.0%** | 7.2% | 0.65 | 0.0043 |
| ElevenLabs Scribe v2 | 7.5% | 8.6% | **3.0%** | 11.7% | 9.8% | 6.8% | 3.5% | 0.75 | 0.0037 |
| Google Chirp 3 | 6.4% | 9.6% | 3.9% | 7.8% | 10.2% | 11.1% | **2.3%** | 1.91 | 0.0173 |
| Google Gemini 3.5 Transcribe | 7.7% | 8.6% | 3.4% | **7.4%** | 9.8% | 12.0% | 2.9% | 2.31 | 0.0053 |
| **Mistral Voxtral Mini Transcribe 3.0** | 6.4% | 9.1% | 3.5% | 8.2% | 7.7% | **6.0%** | **2.3%** | 0.67 | 0.0032 |
| NVIDIA Nemotron 3.5 ASR 0.6B | 7.5% | 11.1% | 12.1% | 13.3% | 20.9% | 21.8% | 8.9% | 1.33 | 0.0002 |
| OpenAI GPT-4o mini Transcribe | 10.3% | 14.6% | 4.2% | 13.6% | 13.2% | 13.7% | 3.9% | 0.85 | 0.0018 |
| OpenAI GPT Transcribe | 5.5% | **8.2%** | 3.7% | 10.4% | 7.7% | 10.7% | 3.2% | 0.84 | 0.0049 |
| OpenAI Whisper large-v3 turbo | 9.2% | 13.9% | 7.9% | 61.9% | 22.6% | 17.9% | 4.2% | 1.41 | 0.0003 |
| Qwen3-ASR 1.7B | **4.0%** | 8.6% | 4.2% | 13.7% | 14.0% | 16.2% | 4.1% | 0.80 | 0.0004 |

FLEURS has 25 clips per language and Common Voice 40 per set (many of them one to three words), so a gap of a point
or two there is within noise.

### Without the hint

What the panel's Auto setting gets. The Central Africa set was not run without the hint.

| Model | Niger fr | FLEURS fr | FLEURS hi | CV Brazil pt | CV Portugal pt | FLEURS pt | Latency, fr + hi (s) |
|---|---|---|---|---|---|---|---|
| AssemblyAI Universal-3.6 Pro | **13.9%** | 4.1% | 9.3% | 9.8% | **22.6%** | 2.7% | 0.39 |
| Deepgram Nova-3 | **97.1%** | **96.0%** | **100.3%** | **95.7%** | **93.6%** | **99.8%** | 0.55 |
| ElevenLabs Scribe v2 | 9.4% | 3.3% | 11.6% | 10.6% | 9.4% | 3.6% | 0.80 |
| Google Chirp 3 | 9.7% | 4.3% | 7.2% | 10.6% | 11.1% | 2.4% | 2.19 |
| Google Gemini 3.5 Transcribe | 10.3% | 3.0% | 6.9% | **17.9%** | 15.0% | 3.8% | 2.30 |
| **Mistral Voxtral Mini Transcribe 3.0** | 9.6% | 3.3% | 8.0% | 8.1% | 7.3% | 2.3% | 0.77 |
| NVIDIA Nemotron 3.5 ASR 0.6B | 11.9% | 11.7% | 15.3% | 22.1% | 28.6% | 8.6% | 1.39 |
| OpenAI GPT-4o mini Transcribe | 16.2% | 4.6% | 11.9% | 15.3% | 13.2% | 3.5% | 0.87 |
| OpenAI GPT Transcribe | 10.3% | 4.1% | 10.1% | 12.3% | 13.7% | 2.7% | 0.90 |
| OpenAI Whisper large-v3 turbo | 17.4% | 16.4% | **75.0%** | 21.3% | 24.8% | 3.9% | 1.29 |
| Qwen3-ASR 1.7B | 8.9% | 4.3% | 13.0% | 15.3% | 20.1% | 3.8% | 0.93 |

Bold here marks a large drop from the hinted result. Without a hint:
- **Deepgram Nova-3 falls apart:** it returns nothing for many clips and English for most of the rest. With the hint
  it is the most accurate on Common Voice Portuguese, but Auto sends no hint.
- **Whisper writes some Hindi in Urdu script** (5 of 25 clips). It also returns empty text for about a third of
  Hindi clips, with or without the hint.
- **Voxtral returned every FLEURS French and Hindi clip in the right language.** It sometimes guesses another script:
  1 of 105 French clips, and 4 of 105 Portuguese ones, all one- or two-word prompts. The panel guards against this: Auto
  sends the languages it expects and retries once with a fallback language, and a transcript in the wrong script is
  refused rather than typed into the input.

## The pick: Voxtral

- **Accurate everywhere:** in the top group on every set, French, Hindi and Portuguese.
- **Hardly affected by a missing hint,** which matters because Auto sends none.
- **Fast:** 0.67 s median on the French and Hindi clips, among the three fastest.
- **Cheap:** of the four models under 10% WER on Hindi, it is the cheapest, at $0.0032 per audio minute: under half a
  cent per minute of speech.

**Alternatives,** which an admin can choose in Settings → AI assistant:
- **Gemini 3.5 Transcribe** has the best Hindi (7.4%, 6.9% with no hint) but is 3 to 4 times slower (2.3 s).
- **GPT Transcribe** and **Qwen3-ASR** did best on African-accented French (Niger 8.2%, Central Africa 4.0%), but
  their Hindi is weaker.
- **Deepgram Nova-3** is best on Common Voice Portuguese with a hint. It suits a deployment where everyone picks
  Portuguese in the menu (which always sends the hint), not one that uses Auto.

## Known gaps

- **No African Portuguese.** Common Voice has no speakers labelled Mozambican or Angolan, and no other open set with
  such labels was found. European Portuguese stands in for them; the leading models do about as well on it as on
  Brazilian, but the accent itself is not tested.
- **Read speech, not voice notes.** Real questions bring room noise, phone microphones, place and indicator names,
  numbers, and switching between languages. WER will be higher. Short voice notes of real dashboard questions, in
  African-accented French and in Hindi, have been requested from colleagues; none are scored in this folder yet.
- **Not tested end to end with a real key.** The server's speech endpoint is tested against a stub provider; real
  clips through the deployed mic → server → provider path wait for a production speech-to-text key.
- **Small sets.** 25 to 80 clips per set: enough to separate good from bad models, not to rank close ones.

## Re-running

From this folder, with an OpenRouter key taken from a secret store for the one command (never written to a file):

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -I fetch_audio.py
OPENROUTER_API_KEY=... .venv/bin/python -I stt_bench.py data/manifest.jsonl --systems or:mistralai/voxtral-mini-transcribe-3-0 [--nohint]
.venv/bin/python -I score.py && .venv/bin/python -I fetch_audio.py --delete
```

`score_detect.py` adds the hint versus no-hint view, `per_clip.py` rebuilds the per-clip CSV, and `--sets` limits a
run to some sets. To score your own voice notes, see [SPEECH.md](SPEECH.md#rerunning-it).

## Files

| File | What |
|---|---|
| [SPEECH.md](SPEECH.md) | the full report: method, results, Portuguese, failures, the decision, the live-app incident, attribution |
| [`data/manifest.jsonl`](data/manifest.jsonl) | the 315 clips: id, set, language, speaker, source path, reference text, seconds |
| [`results/`](results/) | raw output per model and pass (22 files), and [`per_clip.csv`](results/per_clip.csv) with every transcript and its WER |
| [`stt_bench.py`](stt_bench.py), [`score.py`](score.py), [`score_detect.py`](score_detect.py), [`per_clip.py`](per_clip.py) | run, score, check the output language, build the CSV |
| [`fetch_audio.py`](fetch_audio.py), [`pick_pt.py`](pick_pt.py), [`folder_manifest.py`](folder_manifest.py) | fetch the clips, pick the Portuguese ones, turn your own folder of clips into a manifest |
