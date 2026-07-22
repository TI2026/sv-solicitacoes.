import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ShoppingCart } from 'lucide-react';
import { PurchaseAttachment } from '../queries/purchaseLoader';
import { useNavigate } from 'react-router-dom';
import { DynamicCategorySelect } from '@/components/DynamicCategorySelect';

const formSchema = z.object({
  category: z.string().min(1, 'A categoria é obrigatória'),
  description: z.string().min(5, 'A descrição deve ter pelo menos 5 caracteres'),
  justification: z.string().optional(),
  priority: z.string().min(1, 'A prioridade é obrigatória'),
  estimated_value: z.coerce.number().min(0, 'Valor estimado inválido'),
  supplier: z.string().optional(),
  cost_center: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  initialData?: Partial<FormValues> & { attachments?: PurchaseAttachment[] };
  onSubmit: (data: Partial<FormValues> & { attachments: PurchaseAttachment[] }) => Promise<void>;
  isLoading?: boolean;
}

export function PurchaseForm({ initialData, onSubmit, isLoading }: Props) {
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: initialData?.category || '',
      description: initialData?.description || '',
      justification: initialData?.justification || '',
      priority: initialData?.priority || 'normal',
      estimated_value: initialData?.estimated_value || 0,
      supplier: initialData?.supplier || '',
      cost_center: initialData?.cost_center || '',
    },
  });

  const handleSubmit = async (values: FormValues) => {
    await onSubmit({ ...values, attachments: initialData?.attachments || [] });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Dados da Compra
            </CardTitle>
            <CardDescription>Preencha os dados da solicitação de compra.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria *</FormLabel>
                        <DynamicCategorySelect
                          module="compras"
                          fieldKey="category"
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Selecione ou adicione..."
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prioridade *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="baixa">Baixa (Planejada)</SelectItem>
                            <SelectItem value="normal">Normal (Padrão)</SelectItem>
                            <SelectItem value="alta">Alta (Urgente)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição do Item / Serviço *</FormLabel>
                      <FormControl>
                        <Input placeholder="O que precisa ser comprado?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="estimated_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor Estimado (R$) *</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="supplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fornecedor (Sugestão)</FormLabel>
                        <FormControl>
                          <DynamicCategorySelect
                            module="compras"
                            fieldKey="supplier"
                            value={field.value || ''}
                            onValueChange={field.onChange}
                            placeholder="Selecione ou adicione (opcional)"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cost_center"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Centro de Custo (Opcional)</FormLabel>
                        <FormControl>
                          <DynamicCategorySelect
                            module="compras"
                            fieldKey="cost_center"
                            value={field.value || ''}
                            onValueChange={field.onChange}
                            placeholder="Obra, Setor, Projeto..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="justification"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Justificativa (Motivo da compra)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descreva por que esta compra é necessária" className="resize-none" rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={isLoading}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Salvar Compra
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
