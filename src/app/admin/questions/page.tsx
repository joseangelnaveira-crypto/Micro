import { getQuestionBankBreakdown } from '../actions';
import QuestionsAdmin from './QuestionsAdmin';

export default async function AdminQuestionsPage() {
  const breakdown = await getQuestionBankBreakdown();
  return <QuestionsAdmin initialBreakdown={breakdown} />;
}
