import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import styled from 'styled-components';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  max-width: 768px;
  margin: 0 auto;
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
`;

const MessageList = styled.div`
  flex-grow: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  & > * {
    flex-shrink: 0;
  }
`;

const Message = styled.div<{ from: 'system' | 'user' | 'assistant' | 'assistant_temp' }>`
  align-self: ${props => (props.from === 'user' ? 'flex-end' : 'flex-start')};
  background-color: ${props => (props.from === 'user' ? '#007bff' : '#f1f1f1')};
  color: ${props => (props.from === 'user' ? 'white' : props.from === 'system' ? 'red' : 'black')};
  padding: 10px 15px;
  border-radius: 18px;
  max-width: 70%;
  word-wrap: break-word;
  white-space: pre-wrap;
  p {
    margin: 0;
  }
  pre {
    overflow-x: auto;
  }
  code {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 2px 4px;
    border-radius: 4px;
    font-family: 'Courier New', Courier, monospace;
  }
`;

const InputArea = styled.form`
  display: flex;
  padding: 10px;
  border-top: 1px solid #ccc;
`;

const TextInput = styled.input`
  flex-grow: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-right: 10px;
  font-size: 16px;
`;

const SendButton = styled.button`
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;

  &:hover {
    background-color: #0056b3;
  }
`;

const LoadingIndicator = styled.div`
  display: inline-block;
  width: 24px;
  height: 24px;
  background-image: url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle fill='%23f1f1f1' cx='4' cy='12' r='3'%3E%3Canimate attributeName='cy' values='12;6;12;12' keyTimes='0;0.286;0.571;1' dur='1.05s' repeatCount='indefinite' keySplines='.33,0,.66,.33;.33,.66,.66,1'/%3E%3C/circle%3E%3Ccircle fill='%23f1f1f1' cx='12' cy='12' r='3'%3E%3Canimate attributeName='cy' values='12;6;12;12' keyTimes='0;0.286;0.571;1' dur='1.05s' repeatCount='indefinite' keySplines='.33,0,.66,.33;.33,.66,.66,1' begin='0.1s'/%3E%3C/circle%3E%3Ccircle fill='%23f1f1f1' cx='20' cy='12' r='3'%3E%3Canimate attributeName='cy' values='12;6;12;12' keyTimes='0;0.286;0.571;1' dur='1.05s' repeatCount='indefinite' keySplines='.33,0,.66,.33;.33,.66,.66,1' begin='0.2s'/%3E%3C/circle%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
`;

type MessageType = {
  role: 'system' | 'user' | 'assistant' | 'assistant_temp';
  content: string;
};

export default function Test() {

  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: MessageType = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage, { role: 'assistant_temp', content: '' }]);
    setInput('');

    const payload = {
      messages: [...messages, userMessage],

      stream: true,
      cache_prompt: true,

      samplers: 'edkypmxt',
      temperature: 0.8,
      dynatemp_range: 0,
      dynatemp_exponent: 1,

      top_k: 40,
      top_p: 0.95,
      min_p: 0.05,
      typical_p: 1,

      xtc_probability: 0,
      xtc_threshold: 0.1,

      repeat_last_n: 64,
      repeat_penalty: 1,
      presence_penalty: 0,
      frequency_penalty: 0,

      dry_multiplier: 0,
      dry_base: 1.75,
      dry_allowed_length: 2,
      dry_penalty_last_n: -1,

      max_tokens: -1,
      timings_per_token: false
    };

    try {
      const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';

      while (true) {

        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          
          const payload = line.replace(/^data: /, '');    
          if (payload === '[DONE]') continue;
          
          const parsed = JSON.parse(payload);
          const content = parsed.choices[0].delta.content;
          
          if (content) {
            assistantText += content;
            setMessages(prev => [
              ...prev.filter(m => m.role !== 'assistant_temp'),
              { role: 'assistant_temp', content: assistantText }
            ]);
          }
          if (parsed.choices[0].finish_reason === 'stop') {
            setMessages(prev => [
              ...prev.filter(m => m.role !== 'assistant_temp'),
              { role: 'assistant', content: assistantText }
            ]);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching completion:', error);
      const errorMessage: MessageType = { role: 'system', content: 'Error fetching response from the model.' };
      setMessages(prev => [...prev.filter(m => m.role !== 'assistant_temp'), errorMessage]);
    }
  };

  return (
    <ChatContainer>
      <MessageList>
        {messages.map((msg, index) => (
          (msg.role === 'assistant_temp' && msg.content === '')
              ? <LoadingIndicator />
              : <Message key={index} from={msg.role}>
                  <ReactMarkdown
                    components={{
                      code(props) {
                        const {children, className, node, ...rest} = props
                        const match = /language-(\w+)/.exec(className || '');
                        return match
                          ? <SyntaxHighlighter
                              {...rest}
                              language={match[1]}
                              PreTag='div'
                              style={vscDarkPlus}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          : <code className={className} {...props}>
                              {children}
                            </code>
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </Message>
        ))}
      </MessageList>
      <InputArea onSubmit={handleSend}>
        <TextInput
          type='text'
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder='Type your message...'
        />
        <SendButton type='submit'>Send</SendButton>
      </InputArea>
    </ChatContainer>
  );
}