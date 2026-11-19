# Gera o modelo de embeddings de mentira dos testes da busca (Fase 80): a interface do
# multilingual-e5-small (input_ids, attention_mask e token_type_ids → last_hidden_state), com 8
# dimensões e um vocabulário de palavras inteiras. Palavras do mesmo grupo (jantar e sushi perto
# de restaurante; oficina perto de carro) ficam com vetores parecidos.
# Uso: pip install onnx numpy; python3 gerar.py (nesta pasta).
import json

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

V, D = 32, 8
rng = np.random.default_rng(7)
table = rng.normal(size=(V, D)).astype(np.float32)
for head, members in {4: [5, 6], 7: [8]}.items():
    for m in members:
        table[m] = table[head] + 0.05 * rng.normal(size=D).astype(np.float32)
nodes = [
    helper.make_node('Gather', ['table', 'input_ids'], ['last_hidden_state'], axis=0),
    helper.make_node('Cast', ['attention_mask'], ['mask_f'], to=TensorProto.FLOAT),
    helper.make_node('Cast', ['token_type_ids'], ['types_f'], to=TensorProto.FLOAT),
]
inputs = [
    helper.make_tensor_value_info(n, TensorProto.INT64, ['b', 's'])
    for n in ['input_ids', 'attention_mask', 'token_type_ids']
]
outputs = [
    helper.make_tensor_value_info('last_hidden_state', TensorProto.FLOAT, ['b', 's', D]),
    helper.make_tensor_value_info('mask_f', TensorProto.FLOAT, ['b', 's']),
    helper.make_tensor_value_info('types_f', TensorProto.FLOAT, ['b', 's']),
]
graph = helper.make_graph(nodes, 'mini', inputs, outputs, [numpy_helper.from_array(table, 'table')])
model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)])
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, 'model.onnx')

words = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'restaurante', 'jantar', 'sushi', 'carro', 'oficina',
         'query', 'passage', ':', 'shiro', 'ana', 'qual', 'aquele', 'no', 'da', 'sugestao', 'dela',
         'levar', 'o', 'a', 'na']
special = {'[CLS]': {'id': '[CLS]', 'ids': [2], 'tokens': ['[CLS]']},
           '[SEP]': {'id': '[SEP]', 'ids': [3], 'tokens': ['[SEP]']}}
tokenizer = {
    'version': '1.0', 'truncation': None, 'padding': None, 'added_tokens': [],
    'normalizer': {'type': 'BertNormalizer', 'clean_text': True, 'handle_chinese_chars': True,
                   'strip_accents': True, 'lowercase': True},
    'pre_tokenizer': {'type': 'BertPreTokenizer'},
    'post_processor': {
        'type': 'TemplateProcessing',
        'single': [{'SpecialToken': {'id': '[CLS]', 'type_id': 0}},
                   {'Sequence': {'id': 'A', 'type_id': 0}},
                   {'SpecialToken': {'id': '[SEP]', 'type_id': 0}}],
        'pair': [{'Sequence': {'id': 'A', 'type_id': 0}}, {'Sequence': {'id': 'B', 'type_id': 1}}],
        'special_tokens': special},
    'decoder': None,
    'model': {'type': 'WordLevel', 'vocab': {w: i for i, w in enumerate(words)}, 'unk_token': '[UNK]'},
}
with open('tokenizer.json', 'w') as out:
    json.dump(tokenizer, out, ensure_ascii=False, indent=1)
with open('tokenizer_config.json', 'w') as out:
    json.dump({'tokenizer_class': 'BertTokenizer'}, out)
