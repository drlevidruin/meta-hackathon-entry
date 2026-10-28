import numpy as np


def decode(probs, id_to_token, pad_id, frame_seconds=0.02, hidden=None):
    ids = np.argmax(probs, axis=1)
    tokens = []
    spans = []
    start = 0
    while start < len(ids):
        token_id = int(ids[start])
        end = start + 1
        while end < len(ids) and ids[end] == token_id:
            end += 1
        if token_id != pad_id:
            mean = np.mean(probs[start:end], axis=0)
            best = np.argsort(-mean, kind='stable')[:5]
            tokens.append({
                'token': id_to_token[token_id],
                'start': round(start * frame_seconds, 2),
                'end': round(end * frame_seconds, 2),
                'top': [[id_to_token[int(index)], round(float(mean[index]), 3)] for index in best],
            })
            spans.append((start, end))
        start = end
    if hidden is not None:
        frames = len(hidden)
        for i, (s, e) in enumerate(spans):
            prev_end = spans[i - 1][1] if i > 0 else max(0, s - 6)
            next_start = spans[i + 1][0] if i + 1 < len(spans) else min(frames, e + 6)
            a, b = max(prev_end, s - 6), min(next_start, e + 6)
            a, b = min(a, s), max(b, e)
            tokens[i]['probe'] = [round(float(value), 4) for value in hidden[a:b].mean(axis=0)]
    return tokens
