Long-render test data + analysis (used by tests/long.js / tests/long.html):

    python3 tests/long-tools/gen.py 10 /tmp/long/s10.json 10     # sections of sentences for a ~10 min script
    python  tests/long-tools/tts.py s10                           # Piper voice per section + 2600 Hz probe beeps (needs piper + numpy)
    ln -sfn /tmp/long tests/out/longdata; python3 -m http.server 8765 &
    SEG=75 node tests/long.js s10 16:9 0.6667 /tmp/long/long10-16x9.webm 3   # render (interrupt after segment 3, then resume)
    python  tests/long-tools/analyze.py /tmp/long/long10-16x9.webm            # duration, join gaps, beep-vs-flash A/V offsets
