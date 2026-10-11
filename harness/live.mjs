const query = new URLSearchParams(location.search);
const textarea = document.querySelector('textarea');
textarea.readOnly = query.has('readonly');
window.widget = await window.adapter.init(textarea.id, '/vizcode/widget.js', 'http://127.0.0.1:4101/live/broker.html', 'fixture');
document.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    window.submittedValue = textarea.value;
    document.querySelector('#submitted').textContent = textarea.value;
});